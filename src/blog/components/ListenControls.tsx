// Read-aloud controls for a blog post, as a shadcn/ui island.
//
// Preferred path: pre-rendered audio in the author's voice from
// /blog/audio/<slug>.{json,mp3} (scripts/generate-audio.mjs), with the
// paragraph highlight driven by the timing JSON. Fallback, when that is
// missing (new post, astro dev has no Worker) or fails: the browser's speech
// synthesis, one block per utterance. Both backends implement `Player`.
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
import "../../styles/islands.css";

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

// What the transport bar shows. Audio: seconds played / total seconds.
// Speech synthesis: paragraphs read / total paragraphs (not seekable).
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

// The stored rate as an external store rather than state seeded from an
// effect. It can't be read on the server, and reading it during the hydration
// render would mismatch the server HTML, so useSyncExternalStore is the
// sanctioned shape: getServerSnapshot supplies what the server rendered and
// React re-renders once after hydration. (utils/useTheme.js is an external
// store for the same reason.) The value is held in memory as well as in
// localStorage so the picker still works when storage is blocked.
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
  const rateRef = useRef<SpeechRate>(1);
  const blocksRef = useRef<Block[]>([]);
  const playerRef = useRef<Player | null>(null);
  const highlightedRef = useRef<HTMLElement | null>(null);

  const highlight = useCallback((el: HTMLElement | null) => {
    if (el === highlightedRef.current) return;
    highlightedRef.current?.classList.remove("is-speaking");
    highlightedRef.current = el;
    if (el) {
      el.classList.add("is-speaking");
      const block = scrollTarget(el.getBoundingClientRect(), window.innerHeight);
      if (block) el.scrollIntoView({ block, behavior: "smooth" });
    }
  }, []);

  // Word-level highlight inside the current block. Spans are created lazily
  // the first time a block becomes active and reused afterwards.
  // A word is one or more spans (it may straddle an inline element).
  const wordRef = useRef<HTMLElement[] | null>(null);
  const highlightWord = useCallback((pieces: HTMLElement[] | null) => {
    if (pieces === wordRef.current) return;
    wordRef.current?.forEach(p => p.classList.remove("is-word"));
    wordRef.current = pieces;
    pieces?.forEach(p => p.classList.add("is-word"));
    // Inside a paragraph taller than the reading band, follow the word.
    if (pieces?.length) {
      const block = scrollTarget(pieces[0].getBoundingClientRect(), window.innerHeight, WORD_BAND);
      if (block) pieces[0].scrollIntoView({ block, behavior: "smooth" });
    }
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
    rateRef.current = getRate();
    setSupported((canSpeak || canPlayAudio) && blocksRef.current.length > 0);
    // Chrome keeps talking after the tab navigates away otherwise.
    const onPageHide = () => playerRef.current?.pause();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // ---- browser speech synthesis (fallback) ----------------------------------
  // One block per utterance: Chrome silently stops long utterances after
  // ~15 s, and per-block utterances give the highlight and a resume point.
  const speechPlayer = useCallback((): Player => {
    const synth = window.speechSynthesis;
    let index = 0;
    // The utterance we expect events from. Set to null before cancel() so
    // the cancelled utterance's onend/onerror (sync in some engines) is
    // ignored.
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
      u.rate = rateRef.current;
      u.lang = document.documentElement.lang || "en";
      // Word boundaries arrive with the character offset into the utterance;
      // map it onto the block's rendered word spans. Tokens and spans line up
      // by construction (same normalisation), otherwise skip word highlights.
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
      // Pause = cancel + remember the block; Resume restarts it. Native
      // pause() is a no-op on Chrome for Android and can wedge desktop
      // Chrome, so restarting one paragraph is the reliable trade.
      pause: () => {
        cancel();
        setState("paused");
      },
      // rate is read at utterance creation, so a change mid-block restarts
      // that block at the new speed; a paused reader picks it up on Resume.
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
      const ranges = matched.map(m =>
        m ? { start: m.start, end: m.end } : { start: -1, end: -1 }
      );
      // Per block: its timed words (version 2 JSON) and, once wrapped, the
      // rendered spans they map onto. `null` spans = mismatch, paragraph only.
      const words = timings.blocks.map(b => b.words ?? null);
      const spansByBlock: Array<HTMLElement[][] | null | undefined> = [];
      const wordSpan = (i: number, t: number): HTMLElement[] | null => {
        const w = words[i];
        const el = matched[i]?.el;
        if (!w || !el) return null;
        spansByBlock[i] ??= matchWordSpans(wrapWords(el), w);
        const spans = spansByBlock[i];
        if (!spans) return null;
        const k = wordAt(w, t);
        return k >= 0 ? spans[k] : null;
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
        const i = blockAt(ranges, t);
        // In a gap between blocks keep the previous highlight in place.
        if (i >= 0) {
          highlight(matched[i]?.el ?? null);
          highlightWord(wordSpan(i, t));
        }
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
      audio.addEventListener("error", () => {
        cancelAnimationFrame(raf);
        console.warn("Read-aloud audio failed, falling back to speech synthesis");
        track("listen_audio_fallback");
        const fallback = window.speechSynthesis ? speechPlayer() : null;
        playerRef.current = fallback;
        if (fallback) fallback.play();
        else setState("idle");
      });
      return {
        play: () => void audio.play().catch(() => setState("idle")),
        pause: () => audio.pause(),
        setRate: r => {
          audio.playbackRate = r;
        },
        seek: seconds => {
          audio.currentTime = seconds;
          const i = blockAt(ranges, seconds);
          if (i >= 0) {
            highlight(matched[i]?.el ?? null);
            highlightWord(wordSpan(i, seconds));
          }
          report();
        }
      };
    },
    [slug, highlight, highlightWord, setState, speechPlayer]
  );

  // ---- choose a backend on first use -----------------------------------------
  const loadPlayer = useCallback(async (): Promise<Player | null> => {
    if ("Audio" in window) {
      try {
        const res = await fetch(`/blog/audio/${slug}.json`, {
          headers: { Accept: "application/json" }
        });
        if (res.ok) {
          const timings = (await res.json()) as AudioTimings;
          if ((timings.version === 1 || timings.version === 2) && Array.isArray(timings.blocks)) {
            const player = audioPlayer(timings);
            player.setRate(rateRef.current);
            tag("listen_backend", "audio");
            return player;
          }
        }
        console.warn(`No read-aloud audio for this post (${res.status}), using speech synthesis`);
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
    if (!playerRef.current) {
      // First play of the post: `post` tags the session with what was read,
      // and the backend tag is set inside loadPlayer once one is chosen.
      track("listen_play", { post: slug });
      setState("loading");
      playerRef.current = await loadPlayer();
      if (!playerRef.current) {
        track("listen_unavailable");
        setState("idle");
        return;
      }
    } else {
      track("listen_resume");
    }
    playerRef.current.play();
  };

  const onRate = (next: SpeechRate) => {
    rateRef.current = next;
    publishRate(next);
    track("listen_rate", { listen_rate: `${next}x` });
    playerRef.current?.setRate(next);
  };

  // `supported` can only be decided after mount (it needs speechSynthesis /
  // Audio and the article's blocks), so this used to return null until then.
  // That made the whole 72px control pop in after hydration and push the
  // article down — the page's only layout shift. It now renders at full size
  // from the server in a disabled state and simply becomes interactive once
  // the effect confirms a backend, so nothing moves. A browser with no
  // backend at all keeps the disabled control rather than a reserved gap.
  const busy = state === "loading";
  const playing = state === "speaking";
  const Icon = busy ? Loader2 : playing ? Pause : Play;
  const seekable = progress.seekable;

  // Spotify-shaped transport: round primary play button, thin seek bar with
  // the thumb revealed on hover, times in tabular figures, speed as a pill.
  return (
    <div ref={setRoot} className="flex items-center gap-3 rounded-lg bg-muted/60 py-2 pr-2 pl-2">
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

      <Slider
        className="group min-w-0 flex-1 [&_[data-slot=slider-thumb]]:opacity-0 [&_[data-slot=slider-thumb]]:hover:opacity-100 [&_[data-slot=slider-track]]:h-1 hover:[&_[data-slot=slider-thumb]]:opacity-100 focus-within:[&_[data-slot=slider-thumb]]:opacity-100"
        value={[progress.position]}
        max={progress.length || 1}
        step={seekable ? 0.1 : 1}
        disabled={!seekable || !supported}
        aria-label="Seek"
        onValueChange={([v]) => {
          if (seekable) playerRef.current?.seek?.(v);
        }}
        onValueCommit={() => {
          // Commit, not every drag tick — one event per scrub.
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
            // w-14 (not auto): a stored 1.75x would otherwise widen the pill
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
