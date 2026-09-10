// Pure helpers that keep the paragraph highlight in step with pre-rendered
// audio. Types mirror the timing JSON written by scripts/generate-audio.ts.

import type { TimedWord } from "./audio-words";

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
  page: ReadonlyArray<{ el: T; text: string }>,
  timed: ReadonlyArray<TimedBlock>
): Array<MatchedBlock<T> | null> {
  return page.map((block, i) => {
    const t = timed[i];
    return t && t.text === block.text ? { el: block.el, start: t.start, end: t.end } : null;
  });
}

// Binary search for the block whose [start, end) contains t; -1 if none.
export function blockAt(timed: ReadonlyArray<{ start: number; end: number }>, t: number): number {
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

// Where to scroll so the reader keeps up with the highlight. `nearest` was
// the earlier choice and it only moves once the block has left the screen,
// then parks it on the bottom edge. Instead: do nothing while the block's top
// sits in a reading band (10-50% of the viewport by default), centre it when
// it drifts out, and for a block taller than the screen show its start.
export interface ScrollBand {
  top: number;
  bottom: number;
}

const BLOCK_BAND: ScrollBand = { top: 0.1, bottom: 0.5 };
// Words only pull the page when they get close to the bottom, so a long
// paragraph scrolls in a few steps rather than on every line. The band
// starts at 0 because a tall block is shown from its start, which puts its
// first word at the very top of the viewport.
export const WORD_BAND: ScrollBand = { top: 0, bottom: 0.8 };

export function scrollTarget(
  rect: { top: number; height: number },
  viewportHeight: number,
  band: ScrollBand = BLOCK_BAND
): "center" | "start" | null {
  const top = rect.top / viewportHeight;
  if (rect.height > viewportHeight) {
    return top >= 0 && top <= band.top ? null : "start";
  }
  return top >= band.top && top <= band.bottom ? null : "center";
}
