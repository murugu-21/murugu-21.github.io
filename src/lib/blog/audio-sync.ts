// Keeps the paragraph highlight in step with pre-rendered audio. The schema
// covers the fields the page reads from the timing JSON written by
// scripts/site/generate-audio.ts.

import { z } from "zod";

export const TimedWord = z.object({ w: z.string(), s: z.number(), e: z.number() });
export type TimedWord = z.infer<typeof TimedWord>;

export const TimedBlock = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  // Version 2 only, and only for blocks the alignment pass matched well.
  words: z.array(TimedWord).optional()
});
type TimedBlock = z.infer<typeof TimedBlock>;

export const AudioTimings = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  duration: z.number(),
  blocks: z.array(TimedBlock)
});
export type AudioTimings = z.infer<typeof AudioTimings>;

// Pair page blocks with timings by position, but only when the normalised
// text still matches: an edited paragraph plays fine, it just isn't lit up.
export function matchBlocks<T>(
  page: ReadonlyArray<{ el: T; text: string }>,
  timed: ReadonlyArray<TimedBlock>
): Array<T | null> {
  return page.map((block, i) => (timed[i]?.text === block.text ? block.el : null));
}

// The block whose [start, end) contains t; -1 if none, including in a gap between blocks.
export function blockAt(timed: ReadonlyArray<{ start: number; end: number }>, t: number): number {
  const i = timed.findLastIndex(b => b.start <= t);
  return i !== -1 && t < timed[i].end ? i : -1;
}

// Leave the block alone while its top sits in the reading band (fractions of
// the viewport), centre it when it drifts out, and show the start of a block
// taller than the screen.
export interface ScrollBand {
  top: number;
  bottom: number;
}

const BLOCK_BAND: ScrollBand = { top: 0.1, bottom: 0.5 };
// Words scroll only near the bottom, so a long paragraph moves in a few steps.
// Top is 0 because a tall block is shown from its start.
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
