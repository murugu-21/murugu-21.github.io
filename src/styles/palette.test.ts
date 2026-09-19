// Contrast guards for the blue-hour light palette.
//
// Light mode's text no longer sits on near-white paper — it sits on the sky
// gradient (--background-image-page), whose deepest stop is a periwinkle that
// gives away a lot of the contrast the old #ffffff canvas provided. Every light
// ink is therefore held to its WCAG bar against the stops it actually lands on
// (and against the dusk-white card surface), the way islands.test.ts holds the
// island tokens. A palette edit should fail here, not ship as unreadable text.
import { describe, expect, it } from "vitest";

import { channels, contrast, luminance } from "./contrast";

// Inlined from global.css by vitest.config.ts (the Workers pool has no
// filesystem).
declare const __GLOBAL_CSS__: string;
// Inlined from the blog's src/blog/styles/prism-dark.css, whose `--- Light
// palette` section darkens Prism's default light inks for the blog's fence.
declare const __PRISM_CSS__: string;
const css = __GLOBAL_CSS__;

const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`no --${name} in global.css`);
  return m[1].trim();
};

// A translucent surface composited over an opaque backdrop.
const over = (rgba: string, backdrop: string): string => {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgba);
  if (!m) throw new Error(`not an rgba colour: ${rgba}`);
  const alpha = Number(m[4]);
  const bg = channels(backdrop);
  return (
    "#" +
    [1, 2, 3]
      .map((i, k) => Math.round(Number(m[i]) * alpha + bg[k] * (1 - alpha)))
      .map(v => v.toString(16).padStart(2, "0"))
      .join("")
  );
};

// The sky's stops, sorted by luminance: `deep` is the stop under the right edge
// of the page (the gradient runs `to left`), `mid` the body of the page, `warm`
// the horizon glow under the hero.
const sky = (() => {
  const m = /--background-image-page:\s*linear-gradient\(([^\n]+)\)/.exec(css);
  if (!m) throw new Error("no --background-image-page gradient in global.css");
  const stops = [...m[1].matchAll(/#[0-9a-f]{6}/gi)].map(s => s[0]);
  if (stops.length < 3) throw new Error("expected at least three sky stops");
  const byLight = [...stops].sort((a, b) => luminance(a) - luminance(b));
  return { deep: byLight[0], mid: byLight[1], warm: byLight[byLight.length - 1] };
})();
const stops = [sky.deep, sky.mid, sky.warm];

// The dusk-white card surface (glow-card) that most body-level light-theme text
// actually sits on, composited over the darkest sky it can float above.
const card = (() => {
  const m = /@utility glow-card \{[\s\S]*?background-color:\s*(rgba\([^)]+\))/.exec(css);
  if (!m) throw new Error("no glow-card background-color in global.css");
  return over(m[1], sky.deep);
})();

const ink = (name: string) => token(`color-${name}`);

describe("blue-hour light palette", () => {
  // Body copy, headings, section subtitles and the post blockquote ink can
  // cross any part of the sky, including its deepest stop — normal text
  // (19px, and the 19.2px blockquote) needs 4.5:1.
  it.each(["text", "title", "subtitle", "text-light"])(
    "keeps --color-%s readable on the sky's deep stop",
    name => {
      expect(contrast(ink(name), sky.deep)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // The .accent word is bold display type in every heading (>= 24px), so it
  // answers to the large-text bar on the sky, and to normal text on the card,
  // where the hover accents live. It also lands on the sky's WARM end — every
  // link hovers to it, at 16px — so the horizon needs the normal-text bar.
  it("keeps --color-amber-ink legible as the accent word (>= 3:1 on the sky)", () => {
    expect(contrast(ink("amber-ink"), sky.deep)).toBeGreaterThanOrEqual(3);
    expect(contrast(ink("amber-ink"), sky.mid)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink("amber-ink"), sky.warm)).toBeGreaterThanOrEqual(4.5);
  });

  // The brighter amber is graphics-only (chip outlines, glows, the starfield's
  // close stars): it must at least separate from the sky it is drawn on.
  it("shows --color-amber graphics against the sky (>= 3:1)", () => {
    expect(contrast(ink("amber"), sky.mid)).toBeGreaterThanOrEqual(3);
  });

  // The blog cards' hover wipe (Blogs.astro) is the dusk violet, and both the
  // card title (white) and its description (80% white) sit on it mid-hover.
  it("keeps text readable on the dusk-violet interactive fill (>= 4.5:1)", () => {
    const fill = ink("dusk-violet");
    expect(contrast("#ffffff", fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over("rgba(255, 255, 255, 0.8)", fill), fill)).toBeGreaterThanOrEqual(4.5);
  });

  // The blog's link hover/focus ink (post.css `.blog-post a:hover`). It sits
  // on 16px links that can cross the sky's deep stop, so it needs the
  // normal-text bar there — the plain amber-ink only clears 3:1 on it.
  it("keeps --color-amber-ink-deep readable as 16px link hover on every stop", () => {
    for (const stop of stops) {
      expect(contrast(ink("amber-ink-deep"), stop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Chip outlines (tag filter chips, per-post tags, the portfolio's skill
  // chips) are the boundary of a UI component: 3:1 against the sky they sit on.
  it("shows the chip outline against every sky stop (>= 3:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-chip-outline"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  // The blog's hr and table rules. Not a WCAG bar (separators are exempt), but
  // the old #aaaaaa vanished at ~1.1:1 on the sky; hold them where a row rule
  // still reads as a line.
  it("keeps the blog's rules visible on every sky stop (>= 2:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-accent-grey"), stop), stop)).toBeGreaterThanOrEqual(2);
    }
  });

  // The read-aloud highlight (post.css): the spoken word is --color-amber at
  // 25% inside its block at 14%, and body ink over both washes must stay AA on
  // the deep stop. The alphas are restated here rather than parsed from
  // post.css, so a change there must be mirrored in this test.
  it("keeps body ink readable through the read-aloud highlight (>= 4.5:1)", () => {
    const amber = channels(ink("amber"));
    const wash = (alpha: number) => `rgba(${amber[0]}, ${amber[1]}, ${amber[2]}, ${alpha})`;
    const block = over(wash(0.14), sky.deep);
    const word = over(wash(0.25), block);
    expect(contrast(ink("text"), word)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps text readable on the dusk-white card surface (>= 4.5:1)", () => {
    for (const name of ["text", "title", "card-subtitle", "blog-container", "amber-ink"]) {
      expect(contrast(ink(name), card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // A card that barely separates from the sky behind it stops reading as a
  // panel. Its border carries some of that (not asserted here), but the surface
  // itself must not vanish.
  it("separates the card surface from the sky it sits on (>= 1.8:1)", () => {
    expect(contrast(card, sky.deep)).toBeGreaterThanOrEqual(1.8);
  });
});

describe("blog light code palette", () => {
  // Prism's default light inks were written for a plain white page, and
  // several sit under AA on the blog's white fence (#999 punctuation at
  // 2.85:1, #690 strings at 3.43, …). prism-dark.css re-inks them in its
  // `--- Light palette` section; every colour there must clear 4.5:1 on the
  // fence. The dark overrides that follow the section are the night palette
  // and are not parsed here — they answer to the dark fence, not white.
  const lightSection = __PRISM_CSS__.split("/* --- Dark palette")[0];
  const inks = [...lightSection.matchAll(/(?<![\w-])color:\s*(#[0-9a-f]{6})/gi)].map(m => m[1]);

  it("finds the light palette's inks", () => {
    expect(inks.length).toBeGreaterThan(0);
  });

  it.each(inks)("keeps %s readable on the white fence", hex => {
    expect(contrast(hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
