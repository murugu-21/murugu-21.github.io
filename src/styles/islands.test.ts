// Contrast guards for the island design tokens.
import { describe, expect, it } from "vitest";

import { contrast } from "./contrast";

// Inlined by vitest.config.ts.
declare const __ISLANDS_CSS__: string;
const css = __ISLANDS_CSS__;

const block = (selector: string): Record<string, string> => {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`no ${selector} block in islands.css`);
  const body = css.slice(at + selector.length, css.indexOf("}", at));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])
  );
};

const LIGHT = block(".ui-island {");
const DARK = block("html.dark-mode .ui-island {");

// Dark mode inherits every token the dark block does not restate.
const theme = (mode: "light" | "dark") => (mode === "light" ? LIGHT : { ...LIGHT, ...DARK });

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
    expect(ratio(mode, "--primary-foreground", "--primary")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps that label readable while hovered (>= 4.5:1)", () => {
    expect(ratio(mode, "--primary-foreground", "--primary-hover")).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the focus ring against the panel (>= 3:1)", () => {
    expect(ratio(mode, "--ring", "--card")).toBeGreaterThanOrEqual(3);
  });

  it("keeps body text readable on the panel (>= 4.5:1)", () => {
    expect(ratio(mode, "--foreground", "--card")).toBeGreaterThanOrEqual(4.5);
  });
});
