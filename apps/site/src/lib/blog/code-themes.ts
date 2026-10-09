import type { ThemeRegistration } from "shiki";
import nightOwl from "shiki/themes/night-owl.mjs";
import nightOwlLight from "shiki/themes/night-owl-light.mjs";

// WCAG AA for normal text: fences are body-size code.
const AA = 4.5;
const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

const channels = (hex: string): number[] =>
  [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));

const toHex = (rgb: number[]): string =>
  `#${rgb.map(v => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const mix = ({ from, to, t }: { from: number[]; to: number[]; t: number }): number[] =>
  from.map((v, i) => Math.round(v + (to[i] - v) * t));

const luminance = (rgb: number[]): number => {
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = ({ fg, bg }: { fg: number[]; bg: number[] }): number => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Shiki drops per-token backgrounds, so every foreground lands on the editor
// background: composite any alpha over it, then push toward the far pole of
// that background in 1% steps until the colour clears AA.
const legibleOn = (background: string) => {
  const bg = channels(background);
  const pole = contrast({ fg: BLACK, bg }) > contrast({ fg: WHITE, bg }) ? BLACK : WHITE;
  return (colour: string): string => {
    const alpha = colour.length === 9 ? Number.parseInt(colour.slice(7), 16) / 255 : 1;
    const opaque = mix({ from: bg, to: channels(colour), t: alpha });
    if (colour.length === 7 && contrast({ fg: opaque, bg }) >= AA) return colour;
    for (let step = 0; step < 100; step++) {
      const fg = mix({ from: opaque, to: pole, t: step / 100 });
      if (contrast({ fg, bg }) >= AA) return toHex(fg);
    }
    return toHex(pole);
  };
};

const withoutItalic = (fontStyle: string): string =>
  fontStyle
    .split(/\s+/)
    .filter(word => word && word !== "italic")
    .join(" ");

/** A copy of `theme` with no italics and every text colour at AA on its editor background. */
export function readable(theme: ThemeRegistration): ThemeRegistration {
  const background = theme.colors?.["editor.background"];
  if (!background) throw new Error(`readable: ${theme.name} has no editor.background`);
  const legible = legibleOn(background);
  const editorForeground = theme.colors?.["editor.foreground"];

  return {
    ...theme,
    name: `${theme.name}-readable`,
    colors: {
      ...theme.colors,
      ...(editorForeground && { "editor.foreground": legible(editorForeground) })
    },
    tokenColors: theme.tokenColors?.map(rule => {
      const { foreground, fontStyle, ...rest } = rule.settings;
      return {
        ...rule,
        settings: {
          ...rest,
          ...(foreground && { foreground: legible(foreground) }),
          // An empty fontStyle still overrides the parent scope's bold or underline.
          ...(fontStyle !== undefined && { fontStyle: withoutItalic(fontStyle) })
        }
      };
    })
  };
}

export const NIGHT_OWL = {
  light: readable(nightOwlLight),
  dark: readable(nightOwl)
} satisfies Record<"light" | "dark", ThemeRegistration>;
