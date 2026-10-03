// WCAG contrast guards for the design tokens: global.css (sky, card, night),
// code.css's light palette and islands.css. The CSS is inlined by vitest.config.ts.
import { describe, expect, it } from "vitest";

declare const __GLOBAL_CSS__: string;
declare const __CODE_CSS__: string;
declare const __ISLANDS_CSS__: string;
const css = __GLOBAL_CSS__;

const channels = (c: string): number[] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(c);
  if (rgb) return [1, 2, 3].map(i => Number(rgb[i]));
  throw new Error(`not a hex or rgb() colour: ${c}`);
};

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = (c: string): number => {
  const [r, g, b] = channels(c).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

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

  // The blog's hr and table rules. Separators are WCAG-exempt; 2:1 keeps them
  // reading as lines.
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

  // The post's table-of-contents rail (src/blog/components/TableOfContents.astro).
  // Collapsed, each heading is a bar drawn straight on the sky: a UI component
  // at 3:1 on every stop. The hr/table rule (accent-grey, 2:1 above) is too
  // faint for that, so the rail has its own translucent navy.
  it("shows the ToC bars against every sky stop (>= 3:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-toc-bar"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  // Expanded, the heading labels (14px) sit on the frosted nav surface
  // (nav-scrolled, the same band the pinned read-aloud bar paints): normal
  // text, 4.5:1. The rail is pinned to the right edge, which is the sky's
  // deep stop (the gradient runs `to left`), so only that stop is checked.
  // text-light is the inactive label, title the active one.
  it("keeps the ToC labels readable on the frosted surface (>= 4.5:1)", () => {
    const surface = over(token("color-nav-scrolled"), sky.deep);
    for (const name of ["text-light", "title"]) {
      expect(contrast(ink(name), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// The night gradient's stops are close in luminance, so every guard runs on
// each stop rather than picking a deepest one.
const night = (() => {
  const m = /--background-image-page-dark:\s*linear-gradient\(([^\n]+)\)/.exec(css);
  if (!m) throw new Error("no --background-image-page-dark gradient in global.css");
  const stops = [...m[1].matchAll(/rgb\(\d+,\s*\d+,\s*\d+\)/g)].map(s => s[0]);
  if (stops.length < 2) throw new Error("expected two night stops");
  return stops;
})();

describe("night palette", () => {
  // Body copy and the blog's links / post titles on the canvas.
  it.each(["text-dark", "blue-light"])("keeps --color-%s readable on the night canvas", name => {
    for (const stop of night) expect(contrast(ink(name), stop)).toBeGreaterThanOrEqual(4.5);
  });

  // The checked tag chip: white text on the box-dark fill (Tag.astro).
  it("keeps white text readable on the checked chip fill (>= 4.5:1)", () => {
    expect(contrast("#ffffff", ink("box-dark"))).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the dark chip outline against the night canvas (>= 3:1)", () => {
    for (const stop of night) {
      expect(contrast(over(token("color-chip-outline-dark"), stop), stop)).toBeGreaterThanOrEqual(
        3
      );
    }
  });

  // The code fence's and inline code's night edge (code.css, post.css).
  it("shows the blog's dark panel edges against the night canvas (>= 3:1)", () => {
    for (const stop of night) {
      expect(contrast(over(token("color-fence-edge-dark"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  // Tag.astro's count badge at night: blue-light numerals on blue-light at 12%
  // over the canvas; on a checked chip, white on white at 10% over the fill.
  // Alphas restated from the utilities, as below.
  it("keeps the tag count badge readable at night (>= 4.5:1)", () => {
    const wash = (name: string, alpha: number) => {
      const c = channels(ink(name));
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
    };
    for (const stop of night) {
      expect(
        contrast(ink("blue-light"), over(wash("blue-light", 0.12), stop))
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrast("#ffffff", over("rgba(255, 255, 255, 0.1)", ink("box-dark")))
    ).toBeGreaterThanOrEqual(4.5);
  });

  // SearchBar.astro's night placeholder: body ink at 75% on the dark-bg field.
  it("keeps the search placeholder readable on the night field (>= 4.5:1)", () => {
    const c = channels(ink("text-dark"));
    const placeholder = over(`rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.75)`, ink("dark-bg"));
    expect(contrast(placeholder, ink("dark-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  // The dark read-aloud highlight (post.css): box-dark at 20% for the word
  // inside its block at 14%. A LINK inside the spoken word (blue-light) is
  // the tight case; body ink has more room. Alphas restated, as for the light
  // guard above.
  it("keeps a link readable through the dark read-aloud highlight (>= 4.5:1)", () => {
    const fill = channels(ink("box-dark"));
    const wash = (alpha: number) => `rgba(${fill[0]}, ${fill[1]}, ${fill[2]}, ${alpha})`;
    for (const stop of night) {
      const word = over(wash(0.2), over(wash(0.14), stop));
      expect(contrast(ink("blue-light"), word)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink("text-dark"), word)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The ToC rail at night: bars are accent-grey-dark straight on the canvas
  // (3:1 as a UI component, which also covers the blog's dark hr and table
  // rules in the same token), labels are text-dark / heading-dark on the dark
  // frosted band (nav-scrolled-dark) over each stop.
  it("shows the ToC bars against the night canvas (>= 3:1)", () => {
    for (const stop of night) {
      expect(contrast(ink("accent-grey-dark"), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the ToC labels readable on the dark frosted surface (>= 4.5:1)", () => {
    for (const stop of night) {
      const surface = over(token("color-nav-scrolled-dark"), stop);
      for (const name of ["text-dark", "heading-dark"]) {
        expect(contrast(ink(name), surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("blog light code palette", () => {
  // Every ink in code.css's `--- Light palette` section must clear AA on the
  // white fence; the dark section after it is not parsed here.
  const lightSection = __CODE_CSS__.split("/* --- Dark palette")[0];
  const inks = [...lightSection.matchAll(/(?<![\w-])color:\s*(#[0-9a-f]{6})/gi)].map(m => m[1]);
  // An empty match would make the it.each below pass vacuously.
  if (inks.length === 0) throw new Error("no inks in code.css's light palette");

  it.each(inks)("keeps %s readable on the white fence", hex => {
    expect(contrast(hex, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe.each(["light", "dark"] as const)("%s island tokens", mode => {
  const block = (selector: string): Record<string, string> => {
    const at = __ISLANDS_CSS__.indexOf(selector);
    if (at === -1) throw new Error(`no ${selector} block in islands.css`);
    const body = __ISLANDS_CSS__.slice(at + selector.length, __ISLANDS_CSS__.indexOf("}", at));
    return Object.fromEntries(
      [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
    );
  };
  const light = block(".ui-island {");
  // Dark mode inherits every token the dark block does not restate.
  const t = mode === "light" ? light : { ...light, ...block("html.dark-mode .ui-island {") };

  // 3:1 is WCAG 1.4.11 for non-text UI; 4.5:1 is 1.4.3 AA for normal text
  // (the panel header title is 16px semibold).
  it.each([
    // the ✦ spark and the tool dot on the bg-muted activity row
    { label: "activity-row indicators", fg: "--primary", bg: "--muted", min: 3 },
    { label: "primary button against the panel", fg: "--primary", bg: "--card", min: 3 },
    { label: "primary button label", fg: "--primary-foreground", bg: "--primary", min: 4.5 },
    {
      label: "primary button label on hover",
      fg: "--primary-foreground",
      bg: "--primary-hover",
      min: 4.5
    },
    { label: "focus ring against the panel", fg: "--ring", bg: "--card", min: 3 },
    { label: "body text on the panel", fg: "--foreground", bg: "--card", min: 4.5 }
  ] as const)("keeps the $label at contrast ($fg on $bg >= $min:1)", ({ fg, bg, min }) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});
