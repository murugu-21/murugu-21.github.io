# Blog image zoom (Notion-style) + responsive post images

**Date:** 2026-06-11 · **Status:** Approved (user, incl. lazy-load amendment)

## Problem
Post images have no CSS constraint (lost in the Gatsby→Astro port): the AWS
architecture diagram (2336px intrinsic) renders at full width and blows out the
layout. User wants Notion-style click-to-zoom viewing.

## Design
1. **Responsive fix** — `blog/src/style.css`:
   `article.blog-post img { max-width: 100%; height: auto; cursor: zoom-in; }`
   (width/height attrs from Astro keep aspect ratio → no CLS).
2. **medium-zoom, lazy** — dependency added to blog app; initialized ONLY on
   post pages ([...slug].astro script) and ONLY on intent:
   - `pointerenter` on any post image → dynamic `import("medium-zoom")` (memoized
     promise) → attach to `article.blog-post img` with
     `{ margin: 24, background: "rgba(0, 0, 0, 0.85)" }`.
   - First `click` (once-listener) → await the same loader → `zoom.open({ target })`,
     guarded against double-open if the library's own click handler already fired.
   - Zero bytes of zoom JS load unless a reader interacts with an image.
3. **Scope guard** — selector touches only post-body imgs (not avatar/icons/mermaid
   SVGs). No captions/galleries/1:1 pan (YAGNI). Zoomed view reuses the
   already-loaded full-res webp.

## Verification
Build + preview: diagram fits the column; click zooms (Notion behavior); Esc/click
closes; no zoom JS in initial network log until interaction. Lighthouse on the post
unchanged (±1). prettier + astro check green.
