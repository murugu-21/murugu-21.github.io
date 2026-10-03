// Read-aloud controls for a blog post. Prefers pre-rendered audio from
// /blog/audio/<slug>.{json,mp3} (scripts/generate-audio.ts); falls back to
// browser speech synthesis when that is missing (new post, astro dev has no
// Worker) or fails.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Loader2, Pause, Play } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import { Slider } from "../../components/ui/slider";
import { tag, track } from "../../lib/analytics";
import { normalizeSpeechText } from "../utils/audio-prep";
import {
  WORD_BAND,
  blockAt,
  matchBlocks,
  scrollTarget,
  type AudioTimings
} from "../utils/audio-sync";
import { matchWordSpans, tokenize, wordAt, wrapWords, type TimedWord } from "../utils/audio-words";
import { parseRate, SPEECH_RATES, speechBlocks, type SpeechRate } from "../utils/speech";

type State = "idle" | "loading" | "speaking" | "paused";

interface Block {
  el: HTMLElement;
  text: string;
}

interface Player {
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  // Only the audio backend can seek; speech synthesis reports paragraphs.
  seek?(seconds: number): void;
}

// Audio: seconds played / total. Speech synthesis: paragraphs read / total.
interface Progress {
  position: number;
  length: number;
  seekable: boolean;
}

const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const RATE_KEY = "listenRate";

const readStoredRate = (): SpeechRate => {
  try {
    return parseRate(localStorage.getItem(RATE_KEY));
  } catch {
    return 1;
  }
};

const storeRate = (rate: SpeechRate) => {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // private mode / storage blocked: the picker still works for this page
  }
};

// An external store: reading localStorage during hydration would mismatch the
// server HTML. Held in memory too so the picker works when storage is blocked.
let currentRate: SpeechRate | null = null;
const rateListeners = new Set<() => void>();

const subscribeRate = (onChange: () => void) => {
  rateListeners.add(onChange);
  return () => {
    rateListeners.delete(onChange);
  };
};

const getRate = (): SpeechRate => (currentRate ??= readStoredRate());
const getServerRate = (): SpeechRate => 1;

const publishRate = (next: SpeechRate) => {
  currentRate = next;
  storeRate(next);
  rateListeners.forEach(fn => fn());
};

const isAudioTimings = (value: unknown): value is AudioTimings =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  (value.version === 1 || value.version === 2) &&
  "blocks" in value &&
  Array.isArray(value.blocks);

const fetchTimings = async (slug: string): Promise<AudioTimings | null> => {
  try {
    const res = await fetch(`/blog/audio/${slug}.json`, {
      headers: { Accept: "application/json" }
    });
    const body: unknown = res.ok ? await res.json() : null;
    if (isAudioTimings(body)) return body;
    console.warn(`No read-aloud audio for this post (${res.status}), using speech synthesis`);
  } catch (err) {
    console.warn("Read-aloud audio unavailable, using speech synthesis", err);
  }
  return null;
};

// Same extraction + normalisation as the generator, so texts line up with
// the timing JSON. The title is read first.
const collectBlocks = (): Block[] => {
  const article = document.querySelector<HTMLElement>("article.blog-post");
  const body = article?.querySelector<HTMLElement>("section[itemprop='articleBody']");
  if (!body) return [];
  const blocks: Block[] = speechBlocks(body)
    .map(b => ({ el: b.el, text: normalizeSpeechText(b.text) }))
    .filter(b => b.text);
  const title = article?.querySelector<HTMLElement>("header h1");
  if (title) {
    const text = normalizeSpeechText(title.textContent ?? "");
    if (text) blocks.unshift({ el: title, text });
  }
  return blocks;
};

export function ListenControls({ slug }: { slug: string }) {
  // The island root, held in state (not a ref) because it is read during
  // render as the dropdown's portal container.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [supported, setSupported] = useState(false);
  const [state, setStateValue] = useState<State>("idle");
  const rate = useSyncExternalStore(subscribeRate, getRate, getServerRate);
  const [progress, setProgress] = useState<Progress>({
    position: 0,
    length: 0,
    seekable: false
  });

  // Refs mirror state for the player closures, which outlive renders.
  const stateRef = useRef<State>("idle");
  const blocksRef = useRef<Block[]>([]);
  const playerRef = useRef<Player | null>(null);
  const highlightedRef = useRef<HTMLElement | null>(null);

  const highlight = useCallback((el: HTMLElement | null) => {
    if (el === highlightedRef.current) return;
    highlightedRef.current?.classList.remove("is-speaking");
    highlightedRef.current = el;
    if (!el) return;
    el.classList.add("is-speaking");
    const block = scrollTarget(el.getBoundingClientRect(), window.innerHeight);
    if (block) el.scrollIntoView({ block, behavior: "smooth" });
  }, []);

  // A word is one or more spans (it may straddle an inline element).
  const wordRef = useRef<HTMLElement[] | null>(null);
  const highlightWord = useCallback((pieces: HTMLElement[] | null) => {
    if (pieces === wordRef.current) return;
    wordRef.current?.forEach(p => p.classList.remove("is-word"));
    wordRef.current = pieces;
    pieces?.forEach(p => p.classList.add("is-word"));
    if (!pieces?.length) return;
    // Inside a paragraph taller than the reading band, follow the word.
    const block = scrollTarget(pieces[0].getBoundingClientRect(), window.innerHeight, WORD_BAND);
    if (block) pieces[0].scrollIntoView({ block, behavior: "smooth" });
  }, []);

  const setState = useCallback(
    (next: State) => {
      stateRef.current = next;
      setStateValue(next);
      if (next === "idle") {
        highlightWord(null);
        highlight(null);
        setProgress(p => ({ ...p, position: 0 }));
      }
    },
    [highlight, highlightWord]
  );

  useEffect(() => {
    const canSpeak = !!window.speechSynthesis && "SpeechSynthesisUtterance" in window;
    const canPlayAudio = "Audio" in window;
    blocksRef.current = collectBlocks();
    setSupported((canSpeak || canPlayAudio) && blocksRef.current.length > 0);
    // Chrome keeps talking after the tab navigates away otherwise.
    const onPageHide = () => playerRef.current?.pause();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Dock the transport bar while a session is live, including loading and
  // pauses; src/pages/blog/[...slug].astro styles `.listening`.
  useEffect(() => {
    const island = root?.closest(".listen-island");
    island?.classList.toggle("listening", state !== "idle");
  }, [root, state]);

  // ---- browser speech synthesis (fallback) ----------------------------------
  // One block per utterance: Chrome silently stops long utterances after
  // ~15 s, and per-block utterances give the highlight and a resume point.
  const speechPlayer = useCallback((): Player => {
    const synth = window.speechSynthesis;
    let index = 0;
    // Nulled before cancel() so the cancelled utterance's onend/onerror (sync
    // in some engines) is ignored.
    let current: SpeechSynthesisUtterance | null = null;
    const cancel = () => {
      current = null;
      synth.cancel();
    };
    const speakFrom = (i: number) => {
      cancel();
      index = i;
      const blocks = blocksRef.current;
      if (i >= blocks.length) {
        index = 0;
        track("listen_complete");
        setState("idle");
        return;
      }
      const block = blocks[i];
      const u = new SpeechSynthesisUtterance(block.text);
      u.rate = getRate();
      u.lang = document.documentElement.lang || "en";
      // Map boundary char offsets onto the block's word spans; skip word
      // highlights if they don't line up.
      const tokens = tokenize(block.text);
      const offsets: number[] = [];
      let pos = 0;
      for (const t of tokens) {
        offsets.push(pos);
        pos += t.length + 1;
      }
      const timed: TimedWord[] = tokens.map(t => ({ w: t, s: 0, e: 0 }));
      let spans: HTMLElement[][] | null | undefined;
      u.onstart = () => {
        if (current !== u) return;
        highlightWord(null);
        highlight(block.el);
        setProgress({
          position: i + 1,
          length: blocks.length,
          seekable: false
        });
      };
      u.onboundary = event => {
        if (current !== u || event.name !== "word") return;
        spans ??= matchWordSpans(wrapWords(block.el), timed);
        if (!spans) return;
        let k = 0;
        while (k + 1 < offsets.length && offsets[k + 1] <= event.charIndex) k++;
        highlightWord(spans[k] ?? null);
      };
      u.onend = () => {
        if (current === u) speakFrom(i + 1);
      };
      u.onerror = event => {
        if (current !== u) return;
        console.error("Speech synthesis failed:", event.error);
        cancel();
        setState("idle");
      };
      current = u;
      synth.speak(u);
      setState("speaking");
    };
    return {
      play: () => speakFrom(index),
      // Cancel and restart the block on resume: native pause() is a no-op on
      // Chrome for Android and can wedge desktop Chrome.
      pause: () => {
        cancel();
        setState("paused");
      },
      // Rate is fixed per utterance, so restart the current block.
      setRate: () => {
        if (stateRef.current === "speaking") speakFrom(index);
      }
    };
  }, [highlight, highlightWord, setState]);

  // ---- pre-rendered audio ---------------------------------------------------
  const audioPlayer = useCallback(
    (timings: AudioTimings): Player => {
      const audio = new Audio(`/blog/audio/${slug}.mp3`);
      audio.preload = "auto";
      const matched = matchBlocks(blocksRef.current, timings.blocks);
      // Per block word spans, matched lazily; null = mismatch.
      const spansByBlock: Array<HTMLElement[][] | null | undefined> = [];
      const wordSpan = (i: number, t: number): HTMLElement[] | null => {
        const w = timings.blocks[i].words;
        const el = matched[i];
        if (!w || !el) return null;
        spansByBlock[i] ??= matchWordSpans(wrapWords(el), w);
        const spans = spansByBlock[i];
        if (!spans) return null;
        const k = wordAt(w, t);
        return k >= 0 ? spans[k] : null;
      };
      // In a gap between blocks keep the previous highlight in place. A block
      // whose text no longer matches clears it.
      const syncHighlight = (t: number) => {
        const i = blockAt(timings.blocks, t);
        if (i < 0) return;
        highlight(matched[i] ?? null);
        highlightWord(wordSpan(i, t));
      };
      let raf = 0;
      let lastTick = -1;
      const report = () =>
        setProgress({
          position: audio.currentTime,
          length: timings.duration || audio.duration || 0,
          seekable: true
        });
      const tick = () => {
        const t = audio.currentTime;
        syncHighlight(t);
        // The bar only needs a few updates a second; the highlight gets 60.
        const quarter = Math.floor(t * 4);
        if (quarter !== lastTick) {
          lastTick = quarter;
          report();
        }
        raf = requestAnimationFrame(tick);
      };
      report();
      audio.addEventListener("play", () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(tick);
        setState("speaking");
      });
      audio.addEventListener("pause", () => {
        cancelAnimationFrame(raf);
        if (stateRef.current !== "idle") setState("paused");
      });
      audio.addEventListener("ended", () => {
        cancelAnimationFrame(raf);
        audio.currentTime = 0;
        track("listen_complete");
        setState("idle");
      });
      let fellBack = false;
      audio.addEventListener("error", () => {
        cancelAnimationFrame(raf);
        console.warn("Read-aloud audio failed, falling back to speech synthesis");
        track("listen_audio_fallback");
        fellBack = true;
        const fallback = window.speechSynthesis ? speechPlayer() : null;
        playerRef.current = fallback;
        if (fallback) fallback.play();
        else setState("idle");
      });
      return {
        // The media error event fires before play() rejects, so once the
        // fallback owns the state the stale rejection must not reset it.
        play: () =>
          void audio.play().catch(() => {
            if (!fellBack) setState("idle");
          }),
        pause: () => audio.pause(),
        setRate: r => {
          audio.playbackRate = r;
        },
        seek: seconds => {
          audio.currentTime = seconds;
          syncHighlight(seconds);
          report();
        }
      };
    },
    [slug, highlight, highlightWord, setState, speechPlayer]
  );

  // ---- choose a backend on first use -----------------------------------------
  const loadPlayer = useCallback(async (): Promise<Player | null> => {
    const timings = "Audio" in window ? await fetchTimings(slug) : null;
    if (timings) {
      try {
        const player = audioPlayer(timings);
        player.setRate(getRate());
        tag("listen_backend", "audio");
        return player;
      } catch (err) {
        console.warn("Read-aloud audio unavailable, using speech synthesis", err);
      }
    }
    if (!window.speechSynthesis) return null;
    tag("listen_backend", "speech");
    return speechPlayer();
  }, [slug, audioPlayer, speechPlayer]);

  const onToggle = async () => {
    if (stateRef.current === "loading") return;
    if (stateRef.current === "speaking") {
      track("listen_pause");
      playerRef.current?.pause();
      return;
    }
    if (playerRef.current) {
      track("listen_resume");
      playerRef.current.play();
      return;
    }
    track("listen_play", { post: slug });
    setState("loading");
    const player = await loadPlayer();
    playerRef.current = player;
    if (!player) {
      track("listen_unavailable");
      setState("idle");
      return;
    }
    player.play();
  };

  const onRate = (next: SpeechRate) => {
    publishRate(next);
    track("listen_rate", { listen_rate: `${next}x` });
    playerRef.current?.setRate(next);
  };

  // Rendered full-size but disabled until mount confirms a backend, so
  // hydration causes no layout shift.
  const busy = state === "loading";
  const playing = state === "speaking";
  const Icon = busy ? Loader2 : playing ? Pause : Play;
  const seekable = progress.seekable;

  // Card surface: a translucent fill vanished into the gradient canvas. At
  // night the island --border (16%) is too faint, hence white/40.
  return (
    <div
      ref={setRoot}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-sm dark:border-white/40"
    >
      <Button
        onClick={onToggle}
        disabled={busy || !supported}
        aria-label={busy ? "Loading" : playing ? "Pause" : "Listen"}
        aria-pressed={playing}
        className="size-10 shrink-0 rounded-full p-0 shadow-sm [&_svg:not([class*='size-'])]:size-5"
      >
        <Icon
          className={busy ? "animate-spin" : playing ? "" : "ml-0.5"}
          fill={playing || busy ? "none" : "currentColor"}
        />
      </Button>

      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {seekable
          ? formatTime(progress.position)
          : progress.length
            ? `${progress.position}/${progress.length}`
            : "0:00"}
      </span>

      {/* Track at 30%/40% foreground: the primitive's 15% vanished on the
          card. Tuned here to keep the vendored slider pristine. */}
      <Slider
        className="group min-w-0 flex-1 **:data-[slot=slider-thumb]:opacity-0 **:data-[slot=slider-thumb]:hover:opacity-100 **:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-foreground/30 dark:**:data-[slot=slider-track]:bg-foreground/40 hover:**:data-[slot=slider-thumb]:opacity-100 focus-within:**:data-[slot=slider-thumb]:opacity-100"
        value={[progress.position]}
        max={progress.length || 1}
        step={seekable ? 0.1 : 1}
        disabled={!seekable || !supported}
        aria-label="Seek"
        onValueChange={([v]) => {
          if (seekable) playerRef.current?.seek?.(v);
        }}
        onValueCommit={() => {
          // One event per scrub, not per drag tick.
          if (seekable) track("listen_seek");
        }}
      />

      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
        {seekable ? formatTime(progress.length) : progress.length ? "¶" : ""}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!supported}
            aria-label="Playback speed"
            // w-14 (not auto): a stored 1.25x would otherwise widen the pill
            // after hydration and nudge the row.
            className="h-7 w-14 shrink-0 rounded-full px-2.5 text-xs font-semibold tabular-nums"
          >
            {rate}×
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent container={root} align="end">
          {SPEECH_RATES.map(r => (
            <DropdownMenuItem key={r} onSelect={() => onRate(r)}>
              {r === rate ? <Check /> : <span className="size-4" />}
              {r}×
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
