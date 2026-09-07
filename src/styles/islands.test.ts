// Contrast guards for the island design tokens.
//
// These exist because of a real regression: switching the palette from green
// to Ashoka Chakra navy (a5d4eb2) moved --primary from #057b01 to #06038d, and
// the dark block never defined a --primary of its own. The thinking row's ✦
// spark is `color: var(--primary)` on `bg-muted`, which went from a marginal
// 3.11:1 to 1.14:1 — invisible. Nothing failed, because nothing checked.
import {describe, expect, it} from "vitest";

// Inlined from islands.css by vitest.config.ts — the Workers pool has no
// filesystem and Vite's CSS pipeline swallows `?raw` for stylesheets.
declare const __ISLANDS_CSS__: string;
const css = __ISLANDS_CSS__;

// The two token blocks in islands.css: `.ui-island { … }` for light and
// `html.dark-mode .ui-island, body.dark .ui-island { … }` for dark.
const block = (selector: string): Record<string, string> => {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in islands.css`);
  const body = css.slice(at + selector.length, css.indexOf("}", at));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [
      m[1],
      m[2].trim()
    ])
  );
};

const LIGHT = block(".ui-island {");
const DARK = block("html.dark-mode .ui-island,\nbody.dark .ui-island {");

// Dark mode inherits every token the dark block does not restate.
const theme = (mode: "light" | "dark") =>
  mode === "light" ? LIGHT : {...LIGHT, ...DARK};

const luminance = (hex: string): number => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ratio = (mode: "light" | "dark", fg: string, bg: string) => {
  const t = theme(mode);
  return contrast(t[fg], t[bg]);
};

describe.each(["light", "dark"] as const)("%s theme tokens", mode => {
  // WCAG 1.4.11: non-text UI indicators need 3:1. The ✦ spark and the tool
  // dot both sit on the bg-muted activity row.
  it("shows the activity-row indicators against the row (>= 3:1)", () => {
    expect(ratio(mode, "--primary", "--muted")).toBeGreaterThanOrEqual(3);
  });

  it("separates a primary button from the panel it sits on (>= 3:1)", () => {
    expect(ratio(mode, "--primary", "--card")).toBeGreaterThanOrEqual(3);
  });

  // WCAG 1.4.3 AA: the panel header title is 16px semibold — normal text.
  it("keeps a primary button's label readable (>= 4.5:1)", () => {
    expect(
      ratio(mode, "--primary-foreground", "--primary")
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps that label readable while hovered (>= 4.5:1)", () => {
    expect(
      ratio(mode, "--primary-foreground", "--primary-hover")
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the focus ring against the panel (>= 3:1)", () => {
    expect(ratio(mode, "--ring", "--card")).toBeGreaterThanOrEqual(3);
  });

  it("keeps body text readable on the panel (>= 4.5:1)", () => {
    expect(ratio(mode, "--foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });
});
