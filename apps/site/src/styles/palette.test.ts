import {
  transform,
  type CssColor,
  type Declaration,
  type Rule,
  type SystemColor,
  type TokenOrValue
} from "lightningcss";
import { describe, expect, it } from "vite-plus/test";

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

type Mode = "light" | "dark";

const declarations = new Map<string, Declaration[]>();
const recordTopLevelDeclarations = ({ block, rules }: { block: string; rules: Rule[] }) => {
  const topLevel = rules.flatMap(rule =>
    rule.type === "nested-declarations" ? (rule.value.declarations.declarations ?? []) : []
  );
  declarations.set(block, [...(declarations.get(block) ?? []), ...topLevel]);
};
transform({
  filename: "global.css",
  code: new TextEncoder().encode(css),
  customAtRules: {
    theme: { prelude: "*", body: "style-block" },
    utility: { prelude: "<custom-ident>", body: "style-block" }
  },
  visitor: {
    Rule: {
      custom: {
        theme(rule) {
          recordTopLevelDeclarations({ block: "@theme", rules: rule.body.value });
        },
        utility(rule) {
          recordTopLevelDeclarations({
            block: `@utility ${rule.prelude.value}`,
            rules: rule.body.value
          });
        }
      }
    }
  }
});

const nameOf = (declaration: Declaration): string => {
  if (declaration.property === "custom") return declaration.value.name;
  if (declaration.property === "unparsed") return declaration.value.propertyId.property;
  return declaration.property;
};

const declared = ({ block, name }: { block: string; name: string }): Declaration => {
  const found = declarations.get(block)?.findLast(declaration => nameOf(declaration) === name);
  if (!found) throw new Error(`no ${name} in ${block} in global.css`);
  return found;
};

const tokensOf = ({ block, name }: { block: string; name: string }): TokenOrValue[] => {
  const found = declared({ block, name });
  if (found.property !== "custom") throw new Error(`${name} in ${block} is not a custom property`);
  return found.value.value;
};

const side = (mode: Mode | undefined): Mode => {
  if (!mode) throw new Error("a light-dark() colour needs a mode");
  return mode;
};

const isSystemColour = (value: CssColor): value is SystemColor => typeof value === "string";

const colour = (value: CssColor, mode?: Mode): string => {
  if (isSystemColour(value)) throw new Error(`not an sRGB colour: ${value}`);
  if (value.type === "light-dark") return colour(value[side(mode)], mode);
  if (value.type !== "rgb") throw new Error(`not an sRGB colour: ${value.type}`);
  const { r, g, b, alpha } = value;
  if (alpha !== 1) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
};

const resolved = (tokens: TokenOrValue[], mode?: Mode): string => {
  const [only, ...rest] = tokens;
  if (!only || rest.length > 0) throw new Error(`not a single colour: ${JSON.stringify(tokens)}`);
  if (only.type === "color") return colour(only.value, mode);
  if (only.type === "var")
    return resolved(tokensOf({ block: "@theme", name: only.value.name.ident }), mode);
  if (only.type === "unresolved-color" && only.value.type === "light-dark")
    return resolved(only.value[side(mode)], mode);
  throw new Error(`not a colour: ${JSON.stringify(only)}`);
};

const token = (name: string, mode?: Mode): string =>
  resolved(tokensOf({ block: "@theme", name: `--${name}` }), mode);

const gradientStops = (name: string): string[] => {
  const [gradient] = tokensOf({ block: "@theme", name: `--${name}` });
  if (gradient?.type !== "function") throw new Error(`--${name} is not a gradient`);
  return gradient.value.arguments.flatMap(arg => (arg.type === "color" ? [colour(arg.value)] : []));
};

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

const sky = (() => {
  const stops = gradientStops("background-image-page");
  if (stops.length < 3) throw new Error("expected at least three sky stops");
  const byLight = [...stops].sort((a, b) => luminance(a) - luminance(b));
  return { deep: byLight[0], mid: byLight[1], warm: byLight[byLight.length - 1] };
})();
const stops = [sky.deep, sky.mid, sky.warm];

const card = (() => {
  const fill = declared({ block: "@utility glow-card", name: "background-color" });
  if (fill.property !== "background-color")
    throw new Error("glow-card's background isn't a colour");
  return over(colour(fill.value, "light"), sky.deep);
})();

const ink = (name: string, mode?: Mode) => token(`color-${name}`, mode);

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
  it.each(["text", "title", "subtitle", "text-light"])(
    "keeps --color-%s readable on the sky's deep stop",
    name => {
      expect(contrast(ink(name), sky.deep)).toBeGreaterThanOrEqual(4.5);
    }
  );

  // The .accent word is bold display type (>= 24px), so the deep stop takes the large-text
  // bar; links hover to it at 16px, so the mid and warm stops take the normal-text bar.
  it("keeps --color-amber-ink legible as the accent word (>= 3:1 on the sky)", () => {
    expect(contrast(ink("amber-ink"), sky.deep)).toBeGreaterThanOrEqual(3);
    expect(contrast(ink("amber-ink"), sky.mid)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink("amber-ink"), sky.warm)).toBeGreaterThanOrEqual(4.5);
  });

  it("shows --color-amber graphics against the sky (>= 3:1)", () => {
    expect(contrast(ink("amber"), sky.mid)).toBeGreaterThanOrEqual(3);
  });

  it("keeps text readable on the dusk-violet interactive fill (>= 4.5:1)", () => {
    const fill = ink("dusk-violet");
    expect(contrast("#ffffff", fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(over("rgba(255, 255, 255, 0.8)", fill), fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the chip outline against every sky stop (>= 3:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-chip-outline"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the blog's rules visible on every sky stop (>= 2:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-accent-grey"), stop), stop)).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps body ink readable through the read-aloud highlight (>= 4.5:1)", () => {
    const blockAlpha = utilityAlpha({ source: post, utility: "**:data-speaking:bg-amber" });
    const wordAlpha = utilityAlpha({ source: audioWords, utility: "data-current-word:bg-amber" });
    const block = over(rgba("amber", blockAlpha), sky.deep);
    const word = over(rgba("amber", wordAlpha), block);
    expect(contrast(ink("text"), word)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps text readable on the dusk-white card surface (>= 4.5:1)", () => {
    for (const name of ["text", "title", "card-subtitle", "blog-container", "amber-ink"]) {
      expect(contrast(ink(name, "light"), card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("separates the card surface from the sky it sits on (>= 1.8:1)", () => {
    expect(contrast(card, sky.deep)).toBeGreaterThanOrEqual(1.8);
  });

  it("shows the ToC bars against every sky stop (>= 3:1)", () => {
    for (const stop of stops) {
      expect(contrast(over(token("color-toc-bar"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the ToC labels readable on the frosted surface (>= 4.5:1)", () => {
    const surface = over(token("color-nav-scrolled"), sky.deep);
    for (const name of ["text-light", "title"]) {
      expect(contrast(ink(name), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

const night = (() => {
  const found = gradientStops("background-image-page-dark");
  if (found.length < 2) throw new Error("expected two night stops");
  return found;
})();

describe("night palette", () => {
  it.each(["text-dark", "blue-light"])("keeps --color-%s readable on the night canvas", name => {
    for (const stop of night) expect(contrast(ink(name), stop)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps --color-blue legible as night large text and graphics (>= 3:1)", () => {
    for (const stop of night) expect(contrast(ink("blue"), stop)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the project topic chips readable at night (>= 4.5:1)", () => {
    const alpha = utilityAlpha({ source: projects, utility: "dark:bg-blue" });
    for (const stop of night) {
      const fill = over(rgba("blue", alpha), stop);
      expect(contrast(ink("blue-light"), fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps --color-subtitle-muted readable by day and at night (>= 4.5:1)", () => {
    const [light, dark] = [ink("subtitle-muted", "light"), ink("subtitle-muted", "dark")];
    expect(contrast(light, sky.deep)).toBeGreaterThanOrEqual(4.5);
    for (const stop of night) expect(contrast(over(dark, stop), stop)).toBeGreaterThanOrEqual(4.5);
  });

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

  it("shows the blog's dark panel edges against the night canvas (>= 3:1)", () => {
    for (const stop of night) {
      expect(contrast(over(token("color-fence-edge-dark"), stop), stop)).toBeGreaterThanOrEqual(3);
    }
  });

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

  it("keeps the search placeholder readable on the night field (>= 4.5:1)", () => {
    const alpha = utilityAlpha({ source: searchBar, utility: "dark:placeholder:text-text-dark" });
    const placeholder = over(rgba("text-dark", alpha), ink("dark-bg"));
    expect(contrast(placeholder, ink("dark-bg"))).toBeGreaterThanOrEqual(4.5);
  });

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

describe("prose colours", () => {
  const pair = (name: string) => {
    const value = tokensOf({ block: "@utility prose-site", name: `--tw-prose-${name}` });
    return { light: resolved(value, "light"), dark: resolved(value, "dark") };
  };

  it.each(["body", "headings", "bold", "quotes", "code", "links"])(
    "keeps --tw-prose-%s readable by day and at night (>= 4.5:1)",
    name => {
      const { light, dark } = pair(name);
      expect(contrast(light, sky.deep)).toBeGreaterThanOrEqual(4.5);
      for (const stop of night) expect(contrast(dark, stop)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("keeps fence text readable on the fence background (>= 4.5:1)", () => {
    const text = pair("pre-code");
    const bg = pair("pre-bg");
    expect(contrast(text.light, bg.light)).toBeGreaterThanOrEqual(4.5);
    for (const stop of night) {
      expect(contrast(text.dark, over(bg.dark, stop))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

const WCAG_NON_TEXT_UI = 3;
const WCAG_NORMAL_TEXT = 4.5;

describe.each(["light", "dark"] as const)("%s island tokens", mode => {
  const t = (name: string) => resolved(tokensOf({ block: "@utility ui-island", name }), mode);

  it.each([
    { label: "activity-row indicators", fg: "--primary", bg: "--muted", min: WCAG_NON_TEXT_UI },
    {
      label: "primary button against the panel",
      fg: "--primary",
      bg: "--card",
      min: WCAG_NON_TEXT_UI
    },
    {
      label: "primary button label and panel title",
      fg: "--primary-foreground",
      bg: "--primary",
      min: WCAG_NORMAL_TEXT
    },
    {
      label: "primary button label on hover",
      fg: "--primary-foreground",
      bg: "--primary-hover",
      min: WCAG_NORMAL_TEXT
    },
    { label: "focus ring against the panel", fg: "--ring", bg: "--card", min: WCAG_NON_TEXT_UI },
    { label: "body text on the panel", fg: "--foreground", bg: "--card", min: WCAG_NORMAL_TEXT },
    {
      label: "muted text on the panel",
      fg: "--muted-foreground",
      bg: "--card",
      min: WCAG_NORMAL_TEXT
    },
    {
      label: "muted text on a muted fill",
      fg: "--muted-foreground",
      bg: "--muted",
      min: WCAG_NORMAL_TEXT
    },
    {
      label: "text on the secondary fill",
      fg: "--secondary-foreground",
      bg: "--secondary",
      min: WCAG_NORMAL_TEXT
    },
    {
      label: "text on the accent fill",
      fg: "--accent-foreground",
      bg: "--accent",
      min: WCAG_NORMAL_TEXT
    },
    {
      label: "placeholder on the composer fill",
      fg: "--muted-foreground",
      bg: "--secondary",
      min: WCAG_NORMAL_TEXT
    }
  ] as const)("keeps the $label at contrast ($fg on $bg >= $min:1)", ({ fg, bg, min }) => {
    expect(contrast(t(fg), t(bg))).toBeGreaterThanOrEqual(min);
  });
});
