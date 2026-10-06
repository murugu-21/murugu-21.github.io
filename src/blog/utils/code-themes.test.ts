import { describe, expect, it } from "vitest";

import { NIGHT_OWL, readable } from "./code-themes";

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map(i => {
    const s = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = ({ fg, bg }: { fg: string; bg: string }): number => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("readable", () => {
  it("drops italics and lifts every text colour to AA on the editor background", () => {
    const theme = readable({
      name: "sample",
      type: "light",
      colors: { "editor.background": "#ffffff", "editor.foreground": "#989fb1" },
      tokenColors: [
        { scope: "comment", settings: { foreground: "#989fb1", fontStyle: "italic bold" } },
        { scope: "invalid", settings: { foreground: "#ef535090" } },
        { scope: "keyword", settings: { foreground: "#403F53", fontStyle: "italic" } }
      ]
    });

    expect(theme).toEqual({
      name: "sample-readable",
      type: "light",
      colors: { "editor.background": "#ffffff", "editor.foreground": "#707683" },
      tokenColors: [
        { scope: "comment", settings: { foreground: "#707683", fontStyle: "bold" } },
        { scope: "invalid", settings: { foreground: "#a06765" } },
        { scope: "keyword", settings: { foreground: "#403F53", fontStyle: "" } }
      ]
    });
  });
});

describe.each(["light", "dark"] as const)("Night Owl %s", mode => {
  const { colors = {}, tokenColors = [] } = NIGHT_OWL[mode];
  const background = colors["editor.background"];

  it("keeps every text colour at AA on its editor background", () => {
    const inks = [
      colors["editor.foreground"],
      ...tokenColors.flatMap(rule => rule.settings.foreground ?? [])
    ];
    for (const ink of inks) {
      expect(ink).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast({ fg: ink, bg: background }), ink).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sets no token in italics", () => {
    const styles = tokenColors.map(rule => rule.settings.fontStyle ?? "");
    expect(styles.filter(style => style.includes("italic"))).toEqual([]);
    expect(styles).toContain("bold");
  });
});
