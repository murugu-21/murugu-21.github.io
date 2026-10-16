import type { TimedBlock } from "@murugappan/contracts/audio-timings.ts";

export function matchBlocks<T>(
  page: ReadonlyArray<{ el: T; text: string }>,
  timed: ReadonlyArray<TimedBlock>
): Array<T | null> {
  return page.map((block, i) => (timed[i]?.text === block.text ? block.el : null));
}

export function blockAt(timed: ReadonlyArray<{ start: number; end: number }>, t: number): number {
  const i = timed.findLastIndex(b => b.start <= t);
  return i !== -1 && t < timed[i].end ? i : -1;
}

export interface ScrollBand {
  top: number;
  bottom: number;
}

const BLOCK_BAND: ScrollBand = { top: 0.1, bottom: 0.5 };
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
