// Pure helpers for the post's table-of-contents rail
// (src/blog/components/TableOfContents.astro). DOM-free on purpose: the test
// runs on the Workers pool (vitest.config.ts), and the component's script
// hands in plain numbers.

import type { MarkdownHeading } from "astro";

// Slack added to a heading's `scroll-margin-top` to place the reading line.
// A hash jump parks the target heading exactly at its scroll margin, so the
// line sits a few px below it and a `<=` compare lands on the right side
// through sub-pixel scroll positions. The component measures the margin from
// the live heading (post.css owns the value) and adds this.
export const TOC_LINE_SLACK = 8;

// The headings the rail lists: h2 and h3 with visible text. A bare `##` used
// as a separator renders as an empty heading (id "" or "-1") and is skipped.
// One heading is not a table of contents, so fewer than two yields nothing.
export function tocEntries(headings: ReadonlyArray<MarkdownHeading>): MarkdownHeading[] {
  const entries = headings.filter(
    h => (h.depth === 2 || h.depth === 3) && h.text.trim().length > 0
  );
  return entries.length < 2 ? [] : entries;
}

// Which entry is active, given each heading's viewport top in document order
// and the reading line in px from the top of the viewport. The last heading
// whose top has reached the line, or -1 before the first one does. With the
// page scrolled to its end the last heading wins, so a short final section
// whose heading can never reach the line still lights up. (Not "the end of
// the article is on screen": on a tall viewport that is true while the
// reader has just jumped to the second-to-last heading, which must win.)
export function activeIndex(tops: ReadonlyArray<number>, line: number, atEnd: boolean): number {
  if (tops.length === 0) return -1;
  if (atEnd) return tops.length - 1;
  let active = -1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) active = i;
  }
  return active;
}
