import type { MarkdownHeading } from "astro";

// Added to a heading's scroll-margin-top to place the reading line. A hash
// jump parks the heading exactly at its margin, so the slack keeps the `<=`
// compare on the right side through sub-pixel scroll positions.
export const TOC_LINE_SLACK = 8;

export type TocEntry = MarkdownHeading & { depth: 2 | 3 };

export function tocEntries(headings: ReadonlyArray<MarkdownHeading>): TocEntry[] {
  const entries = headings.filter(
    (h): h is TocEntry => (h.depth === 2 || h.depth === 3) && h.text.trim().length > 0
  );
  return entries.length < 2 ? [] : entries;
}

export function activeIndex(tops: ReadonlyArray<number>, line: number, atEnd: boolean): number {
  if (atEnd) return tops.length - 1;
  let active = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i;
  }
  return active;
}
