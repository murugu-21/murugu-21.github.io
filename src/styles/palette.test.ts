// Contrast guards for the blue-hour light palette.
//
// Light mode's text no longer sits on near-white paper — it sits on the sky
// gradient (--background-image-page), whose deepest stop is a periwinkle that
// gives away a lot of the contrast the old #ffffff canvas provided. Every light
// ink is therefore held to its WCAG bar against the stops it actually lands on
// (and against the dusk-white card surface), the way islands.test.ts holds the
// island tokens. A palette edit should fail here, not ship as unreadable text.
import { describe, expect, it } from "vitest";

// Inlined from global.css by vitest.config.ts (the Workers pool has no
// filesystem).
declare const __GLOBAL_CSS__: string;
const css = __GLOBAL_CSS__;

const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`no --${name} in global.css`);
  return m[1].trim();
};

const channels = (c: string): number[] => {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) throw new Error(`not a 6-digit hex colour: ${c}`);
  return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
};

const luminance = (c: string): number => {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(c).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
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

// The dusk-white card surface (glow-card) that most body-level light-theme text
// actually sits on, composited over the darkest sky it can float above.
const card = (() => {
  const m = /@utility glow-card \{[\s\S]*?background-color:\s*(rgba\([^)]+\))/.exec(css);
  if (!m) throw new Error("no glow-card background-color in global.css");
  return over(m[1], sky.deep);
})();

const ink = (name: string) => token(`color-${name}`);

describe("blue-hour light palette", () => {
  // Body copy, headings and section subtitles can cross any part of the sky,
  // including its deepest stop — normal text (19px) needs 4.5:1.
  it.each(["text", "title", "subtitle"])(
    "keeps --color-%s readable on the sky's deep stop",
    name => {
      expect(contrast(ink(name), sky.deep)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // The .accent word is bold display type in every heading (>= 24px), so it
  // answers to the large-text bar on the sky, and to normal text on the card,
  // where the hover accents live.
  it("keeps --color-amber-ink legible as the accent word (>= 3:1 on the sky)", () => {
    expect(contrast(ink("amber-ink"), sky.deep)).toBeGreaterThanOrEqual(3);
    expect(contrast(ink("amber-ink"), sky.mid)).toBeGreaterThanOrEqual(4.5);
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
