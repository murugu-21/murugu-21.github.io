// Pure helpers that keep the paragraph highlight in step with pre-rendered
// audio. Types mirror the timing JSON written by scripts/generate-audio.mjs.

import type {TimedWord} from "./audio-words";

export interface TimedBlock {
  text: string;
  start: number;
  end: number;
  // Version 2 only, and only for blocks the alignment pass matched well.
  words?: TimedWord[];
}

export interface AudioTimings {
  version: 1 | 2;
  slug: string;
  hash: string;
  voice: string;
  sampleRate: number;
  duration: number;
  blocks: TimedBlock[];
}

export interface MatchedBlock<T> {
  el: T;
  start: number;
  end: number;
}

// Pair page blocks with timings by position, but only when the normalised
// text still matches: an edited paragraph plays fine, it just isn't lit up.
export function matchBlocks<T>(
  page: ReadonlyArray<{el: T; text: string}>,
  timed: ReadonlyArray<TimedBlock>
): Array<MatchedBlock<T> | null> {
  return page.map((block, i) => {
    const t = timed[i];
    return t && t.text === block.text
      ? {el: block.el, start: t.start, end: t.end}
      : null;
  });
}

// Binary search for the block whose [start, end) contains t; -1 if none.
export function blockAt(
  timed: ReadonlyArray<{start: number; end: number}>,
  t: number
): number {
  let lo = 0;
  let hi = timed.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = timed[mid];
    if (t < b.start) hi = mid - 1;
    else if (t >= b.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}
