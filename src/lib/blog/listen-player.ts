// The two read-aloud backends behind ListenControls. Pre-rendered audio from
// /blog/audio/<slug>.{json,mp3} (scripts/site/generate-audio.ts) is preferred;
// browser speech synthesis takes over when that is missing (new post, astro dev
// has no Worker) or fails.

import { tag, track } from "#src/lib/analytics.ts";

import { normalizeSpeechText } from "./audio-prep.ts";
import {
  AudioTimings,
  WORD_BAND,
  blockAt,
  matchBlocks,
  scrollTarget,
  type ScrollBand
} from "./audio-sync.ts";
import { matchWordSpans, tokenize, wordAt, wrapWords, type TimedWord } from "./audio-words.ts";
import { speechBlocks } from "./speech.ts";

export interface Block {
  el: Element;
  text: string;
}

export type Status = "idle" | "loading" | "speaking" | "paused";

// Audio counts seconds and can seek; speech synthesis counts blocks.
export interface Progress {
  unit: "none" | "seconds" | "blocks";
  position: number;
  length: number;
}

export interface Player {
  play(): void;
  pause(): void;
  setRate(rate: number): void;
  seek?(seconds: number): void;
}

// What a player reports back to the controls that own the visible state.
export interface Session {
  highlight: Highlighter;
  set(status: Exclude<Status, "loading">): void;
  report(progress: Progress): void;
  // The audio player hands over to speech synthesis when the MP3 fails.
  replace(player: Player | null): void;
}

const follow = (el: Element, band?: ScrollBand) => {
  const block = scrollTarget(el.getBoundingClientRect(), window.innerHeight, band);
  if (block) el.scrollIntoView({ block, behavior: "smooth" });
};

// Marks the block being read (.is-speaking) and its current word (.is-word).
// A word is one or more spans, since it may straddle an inline element.
export class Highlighter {
  #block: Element | null = null;
  #word: HTMLElement[] | null = null;

  block(el: Element | null) {
    if (el === this.#block) return;
    this.#block?.classList.remove("is-speaking");
    this.#block = el;
    el?.classList.add("is-speaking");
    if (el) follow(el);
  }

  word(pieces: HTMLElement[] | null) {
    if (pieces === this.#word) return;
    this.#word?.forEach(p => p.classList.remove("is-word"));
    this.#word = pieces;
    pieces?.forEach(p => p.classList.add("is-word"));
    // Inside a paragraph taller than the reading band, follow the word.
    if (pieces?.length) follow(pieces[0], WORD_BAND);
  }

  clear() {
    this.word(null);
    this.block(null);
  }
}

// The rendered spans of the word at `at` (seconds, or a character offset for
// speech), wrapped and matched on first use. Null when the words disagree.
const wordFinder = (el: Element, words: TimedWord[]) => {
  let spans: HTMLElement[][] | null | undefined;
  return (at: number): HTMLElement[] | null => {
    spans ??= matchWordSpans(wrapWords(el), words);
    return spans?.[wordAt(words, at)] ?? null;
  };
};

// Speech boundary events report character offsets into the block text.
const wordsByOffset = (text: string): TimedWord[] => {
  let offset = 0;
  return tokenize(text).map(w => {
    const s = offset;
    offset += w.length + 1;
    return { w, s, e: s + w.length };
  });
};

// Same extraction and normalisation as the generator, so texts line up with
// the timing JSON. The title is read first.
export const collectBlocks = (): Block[] => {
  const article = document.querySelector("article.blog-post");
  const body = article?.querySelector("section[data-post-body]");
  if (!body) return [];
  const title = article?.querySelector("header h1");
  const titled = title ? [{ el: title, text: title.textContent ?? "" }] : [];
  return [...titled, ...speechBlocks(body)]
    .map(b => ({ el: b.el, text: normalizeSpeechText(b.text) }))
    .filter(b => b.text);
};

const fetchTimings = async (slug: string): Promise<AudioTimings | null> => {
  try {
    const res = await fetch(`/blog/audio/${slug}.json`, {
      headers: { Accept: "application/json" }
    });
    const body: unknown = res.ok ? await res.json() : null;
    const timings = AudioTimings.safeParse(body);
    if (timings.success) return timings.data;
    console.warn(`No read-aloud audio for this post (${res.status}), using speech synthesis`);
  } catch (err) {
    console.warn("Read-aloud audio unavailable, using speech synthesis", err);
  }
  return null;
};

interface Backend {
  blocks: Block[];
  session: Session;
  rate: number;
}

// One block per utterance: Chrome silently stops long utterances after ~15 s,
// and per-block utterances give the highlight and a resume point.
function speechPlayer({ blocks, session, rate }: Backend): Player {
  const synth = window.speechSynthesis;
  let index = 0;
  let speed = rate;
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
    if (i >= blocks.length) {
      index = 0;
      track("listen_complete");
      session.set("idle");
      return;
    }
    const block = blocks[i];
    const findWord = wordFinder(block.el, wordsByOffset(block.text));
    const u = new SpeechSynthesisUtterance(block.text);
    u.rate = speed;
    u.lang = document.documentElement.lang || "en";
    const own =
      <E>(handle: (event: E) => void) =>
      (event: E) => {
        if (current === u) handle(event);
      };
    u.onstart = own(() => {
      session.highlight.word(null);
      session.highlight.block(block.el);
      session.report({ unit: "blocks", position: i + 1, length: blocks.length });
    });
    u.onboundary = own(event => {
      if (event.name === "word") session.highlight.word(findWord(event.charIndex));
    });
    u.onend = own(() => speakFrom(i + 1));
    u.onerror = own(event => {
      console.error("Speech synthesis failed:", event.error);
      cancel();
      session.set("idle");
    });
    current = u;
    synth.speak(u);
    session.set("speaking");
  };

  return {
    play: () => speakFrom(index),
    // Cancel and restart the block on resume: native pause() is a no-op on
    // Chrome for Android and can wedge desktop Chrome.
    pause: () => {
      cancel();
      session.set("paused");
    },
    // Rate is fixed per utterance, so restart the block being spoken.
    setRate: next => {
      speed = next;
      if (current) speakFrom(index);
    }
  };
}

interface AudioBackend extends Backend {
  slug: string;
  timings: AudioTimings;
}

function audioPlayer({ slug, timings, blocks, session, rate }: AudioBackend): Player {
  const audio = new Audio(`/blog/audio/${slug}.mp3`);
  audio.preload = "auto";
  audio.playbackRate = rate;
  const matched = matchBlocks(blocks, timings.blocks);
  const findWord = timings.blocks.map((b, i) => {
    const el = matched[i];
    return el && b.words ? wordFinder(el, b.words) : () => null;
  });
  // In a gap between blocks keep the previous highlight in place. A block
  // whose text no longer matches clears it.
  const syncHighlight = (t: number) => {
    const i = blockAt(timings.blocks, t);
    if (i < 0) return;
    session.highlight.block(matched[i] ?? null);
    session.highlight.word(findWord[i](t));
  };
  const report = () =>
    session.report({
      unit: "seconds",
      position: audio.currentTime,
      length: timings.duration || audio.duration || 0
    });

  let raf = 0;
  let lastQuarter = -1;
  const tick = () => {
    syncHighlight(audio.currentTime);
    // The bar only needs a few updates a second; the highlight gets 60.
    const quarter = Math.floor(audio.currentTime * 4);
    if (quarter !== lastQuarter) {
      lastQuarter = quarter;
      report();
    }
    raf = requestAnimationFrame(tick);
  };

  report();
  audio.addEventListener("play", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    session.set("speaking");
  });
  audio.addEventListener("pause", () => {
    cancelAnimationFrame(raf);
    session.set("paused");
  });
  audio.addEventListener("ended", () => {
    cancelAnimationFrame(raf);
    audio.currentTime = 0;
    track("listen_complete");
    session.set("idle");
  });
  let fellBack = false;
  audio.addEventListener("error", () => {
    cancelAnimationFrame(raf);
    console.warn("Read-aloud audio failed, falling back to speech synthesis");
    track("listen_audio_fallback");
    fellBack = true;
    const speech = window.speechSynthesis
      ? speechPlayer({ blocks, session, rate: audio.playbackRate })
      : null;
    session.replace(speech);
    if (speech) speech.play();
    else session.set("idle");
  });

  return {
    // The media error event fires before play() rejects, so once the
    // fallback owns the state the stale rejection must not reset it.
    play: () =>
      void audio.play().catch(() => {
        if (!fellBack) session.set("idle");
      }),
    pause: () => audio.pause(),
    setRate: next => {
      audio.playbackRate = next;
    },
    seek: seconds => {
      audio.currentTime = seconds;
      syncHighlight(seconds);
      report();
    }
  };
}

// Picks the backend on first use: audio when the post has timings, else
// speech synthesis, else null.
export async function loadPlayer({ slug, ...backend }: Backend & { slug: string }) {
  const timings = "Audio" in window ? await fetchTimings(slug) : null;
  if (timings) {
    tag("listen_backend", "audio");
    return audioPlayer({ slug, timings, ...backend });
  }
  if (!window.speechSynthesis) return null;
  tag("listen_backend", "speech");
  return speechPlayer(backend);
}
