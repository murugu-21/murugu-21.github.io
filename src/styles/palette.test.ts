// WCAG contrast guards for the design tokens in global.css: sky, card, night
// and the islands.
import { describe, expect, it } from "vitest";

import tag from "#src/components/blog/Tag.astro?raw";
import searchBar from "#src/components/blog/SearchBar.astro?raw";
import projects from "#src/components/home/Projects.astro?raw";
import post from "#src/pages/blog/[...slug].astro?raw";

import css from "./global.css?raw";

// Imported dynamically: a static `.ts?raw` default import makes the import plugin
// look for a default export in audio-words.ts itself.
const { default: audioWords } = await import("#src/lib/blog/audio-words.ts?raw");

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

// One side of `light-dark(<light>, <dark>)`: a bare colour or one function such
// as `rgba(...)`, whose own commas must not split the pair.
const SIDE = String.raw`\s*((?:[^(),]|\([^)]*\))+?)\s*`;
const LIGHT_DARK = new RegExp(String.raw`^light-dark\(${SIDE},${SIDE}\)$`);
const lightDark = (value: string): { light: string; dark: string } => {
  const m = LIGHT_DARK.exec(value);
  if (!m) throw new Error(`not a light-dark() pair: ${value}`);
  return { light: m[1], dark: m[2] };
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
  const m = /@utility glow-card \{[\s\S]*?background-color:\s*([^;]+);/.exec(css);
  if (!m) throw new Error("no glow-card background-color in global.css");
  return over(lightDark(m[1]).light, sky.deep);
})();

const ink = (name: string) => token(`color-${name}`);

// The opacity of a Tailwind colour utility such as `dark:bg-blue/15` in a
// component's source, as a 0..1 alpha.
const utilityAlpha = ({ source, utility }: { source: string; utility: string }): number => {
  const alpha = source
    .split(/[\s"'`]+/)
    .find(cls => cls.startsWith(`${utility}/`))
    ?.slice(utility.length + 1);
  if (!alpha || !/^\d+$/.test(alpha))
    throw new Error(`no ${utility}/<alpha> in the component source`);
  return Number(alpha) / 100;
};

const rgba = (name: string, alpha: number): string => {
  const [r, g, b] = channels(ink(name));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

describe("blue-hour light palette", () => {
  // Body copy, headings, section subtitles and the post blockquote ink can
  // cross any part of the sky, including its deepest stop. Normal text
  // (19px, and the 19.2px blockquote) needs 4.5:1.
  it.each(["text", "title", "subtitle", "text-light"])(
    "keeps --color-%s readable on the sky's deep stop",
    name => {
      expect(contrast(ink(name), sky.deep)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // The .accent word is bold display type in every heading (>= 24px), so it
  // answers to the large-text bar on the sky, and to normal text on the card,
  // where the hover accents live. It also lands on the sky's WARM end, and every
  // link hovers to it at 16px, so the horizon needs the normal-text bar.
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

  // The read-aloud highlight: the spoken word (audio-words.ts) is a --color-amber
  // wash inside its block's own amber wash (blog/[...slug].astro), and body ink
  // over both must stay AA on the deep stop.
  it("keeps body ink readable through the read-aloud highlight (>= 4.5:1)", () => {
    const blockAlpha = utilityAlpha({ source: post, utility: "**:data-speaking:bg-amber" });
    const wordAlpha = utilityAlpha({ source: audioWords, utility: "data-current-word:bg-amber" });
    const block = over(rgba("amber", blockAlpha), sky.deep);
    const word = over(rgba("amber", wordAlpha), block);
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

  // The post's table-of-contents rail (src/components/blog/TableOfContents.astro).
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
  const found = [...m[1].matchAll(/rgb\(\d+,\s*\d+,\s*\d+\)/g)].map(s => s[0]);
  if (found.length < 2) throw new Error("expected two night stops");
  return found;
})();

describe("night palette", () => {
  // Body copy and the blog's links / post titles on the canvas.
  it.each(["text-dark", "blue-light"])("keeps --color-%s readable on the night canvas", name => {
    for (const stop of night) expect(contrast(ink(name), stop)).toBeGreaterThanOrEqual(4.5);
  });

  // --color-blue is under 4.5:1 at night, so it is only for large text (the
  // .accent heading word, the 404 heading) and icons; smaller text uses blue-light.
  it("keeps --color-blue legible as night large text and graphics (>= 3:1)", () => {
    for (const stop of night) expect(contrast(ink("blue"), stop)).toBeGreaterThanOrEqual(3);
  });

  // Projects.astro's topic chips: blue-light text on a translucent blue fill
  // over the canvas.
  it("keeps the project topic chips readable at night (>= 4.5:1)", () => {
    const alpha = utilityAlpha({ source: projects, utility: "dark:bg-blue" });
    for (const stop of night) {
      const fill = over(rgba("blue", alpha), stop);
      expect(contrast(ink("blue-light"), fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Secondary text on the homepage and /about: its day side crosses the sky's
  // deep stop, its night side is translucent white on the canvas.
  it("keeps --color-subtitle-muted readable by day and at night (>= 4.5:1)", () => {
    const { light, dark } = lightDark(ink("subtitle-muted"));
    const day = /^var\(--([\w-]+)\)$/.exec(light)?.[1];
    expect(contrast(day ? token(day) : light, sky.deep)).toBeGreaterThanOrEqual(4.5);
    for (const stop of night) expect(contrast(over(dark, stop), stop)).toBeGreaterThanOrEqual(4.5);
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

  // The prose code fence's night edge (Prose.astro).
  it("shows the blog's dark panel edges against the night canvas (>= 3:1)", () => {
    for (const stop of night) {
      expect(contrast(over(token("color-fence-edge-dark"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  // Tag.astro's count badge at night: blue-light numerals on a blue-light wash
  // over the canvas; on a checked chip, white on a white wash over the fill.
  it("keeps the tag count badge readable at night (>= 4.5:1)", () => {
    const badge = rgba("blue-light", utilityAlpha({ source: tag, utility: "dark:bg-blue-light" }));
    for (const stop of night) {
      expect(contrast(ink("blue-light"), over(badge, stop))).toBeGreaterThanOrEqual(4.5);
    }
    const checkedAlpha = utilityAlpha({ source: tag, utility: "group-has-checked:bg-white" });
    expect(
      contrast("#ffffff", over(`rgba(255, 255, 255, ${checkedAlpha})`, ink("box-dark")))
    ).toBeGreaterThanOrEqual(4.5);
  });

  // SearchBar.astro's night placeholder: translucent body ink on the dark-bg field.
  it("keeps the search placeholder readable on the night field (>= 4.5:1)", () => {
    const alpha = utilityAlpha({ source: searchBar, utility: "dark:placeholder:text-text-dark" });
    const placeholder = over(rgba("text-dark", alpha), ink("dark-bg"));
    expect(contrast(placeholder, ink("dark-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  // The dark read-aloud highlight: a box-dark wash for the word inside its
  // block's own box-dark wash. A LINK inside the spoken word (blue-light) is
  // the tight case; body ink has more room.
  it("keeps a link readable through the dark read-aloud highlight (>= 4.5:1)", () => {
    const blockWash = rgba(
      "box-dark",
      utilityAlpha({ source: post, utility: "dark:**:data-speaking:bg-box-dark" })
    );
    const wordWash = rgba(
      "box-dark",
      utilityAlpha({ source: audioWords, utility: "dark:data-current-word:bg-box-dark" })
    );
    for (const stop of night) {
      const word = over(wordWash, over(blockWash, stop));
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

// The typography plugin's text colours (prose-site), each side on its own
// canvas: by day the sky's deep stop, at night every night stop.
describe("prose colours", () => {
  const body = (() => {
    const selector = "@utility prose-site {";
    const at = css.indexOf(selector);
    if (at === -1) throw new Error(`no ${selector} block in global.css`);
    return css.slice(at + selector.length, css.indexOf("}", at));
  })();
  const pair = (name: string) => {
    const m = new RegExp(`--tw-prose-${name}:\\s*([^;]+);`).exec(body);
    if (!m) throw new Error(`no --tw-prose-${name} in prose-site`);
    const resolve = (side: string) => {
      const ref = /^var\(--([\w-]+)\)$/.exec(side)?.[1];
      return ref ? token(ref) : side;
    };
    const { light, dark } = lightDark(m[1].trim());
    return { light: resolve(light), dark: resolve(dark) };
  };

  it.each(["body", "headings", "bold", "quotes", "code", "links"])(
    "keeps --tw-prose-%s readable by day and at night (>= 4.5:1)",
    name => {
      const { light, dark } = pair(name);
      expect(contrast(light, sky.deep)).toBeGreaterThanOrEqual(4.5);
      for (const stop of night) expect(contrast(dark, stop)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // A plain fence (not Shiki's, which brings its own colours) on its panel.
  it("keeps fence text readable on the fence background (>= 4.5:1)", () => {
    const text = pair("pre-code");
    const bg = pair("pre-bg");
    expect(contrast(text.light, bg.light)).toBeGreaterThanOrEqual(4.5);
    for (const stop of night) {
      expect(contrast(text.dark, over(bg.dark, stop))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe.each(["light", "dark"] as const)("%s island tokens", mode => {
  const t = (() => {
    const selector = "@utility ui-island {";
    const at = css.indexOf(selector);
    if (at === -1) throw new Error(`no ${selector} block in global.css`);
    const body = css.slice(at + selector.length, css.indexOf("}", at));
    return Object.fromEntries(
      [...body.matchAll(/(--[\w-]+)\s*:\s*(light-dark\([^;]+);/g)].map(m => [
        m[1],
        lightDark(m[2])[mode]
      ])
    );
  })();

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
