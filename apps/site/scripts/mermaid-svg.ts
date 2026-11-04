import type { Buffer } from "node:buffer";
import type { ParseMDDOptions } from "@mermaid-js/mermaid-cli";

import type { DiagramTheme } from "#src/lib/blog/mermaid-diagrams.ts";

export const THEMES: Record<DiagramTheme, { mermaid: "neutral" | "dark"; background: string }> = {
  light: { mermaid: "neutral", background: "#fff" },
  dark: { mermaid: "dark", background: "#282c35" }
};

const STROKE_PERCENT_IN_DARK_FILL = 28;
const STYLE_LINE = /^\s*(?:style|classDef)\s.*$/gm;
const ANY_FILL = /\bfill:/i;
const FILL = /\bfill:#[0-9a-f]{6}\b/i;
const STROKE = /\bstroke:(#[0-9a-f]{6})\b/i;
const COLOR = /\bcolor:/i;

const channels = (hex: string) =>
  [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16));
const DARK_BACKGROUND = channels(THEMES.dark.background);

function blendIntoDark(stroke: string): string {
  const blended = channels(stroke).map((channel, i) =>
    Math.round(
      (channel * STROKE_PERCENT_IN_DARK_FILL +
        DARK_BACKGROUND[i] * (100 - STROKE_PERCENT_IN_DARK_FILL)) /
        100
    )
  );
  return `#${blended.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

// Mermaid's dark theme draws labels near-white, unreadable on the posts' pastel fills.
export const darkenStyledFills = (source: string) =>
  source.replaceAll(STYLE_LINE, line => {
    if (!ANY_FILL.test(line)) return line;
    const stroke = line.match(STROKE)?.[1];
    if (stroke === undefined || !FILL.test(line) || COLOR.test(line)) {
      throw new Error(
        `mermaid-svg: can't pick a dark-mode fill for "${line.trim()}". ` +
          "Write the fill and stroke as 6-digit hex (fill:#rrggbb,stroke:#rrggbb) and leave out color:."
      );
    }
    return line.replace(FILL, `fill:${blendIntoDark(stroke)}`);
  });

export const fontFace = (woff2: Buffer) =>
  `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;` +
  `src:url(data:font/woff2;base64,${woff2.toString("base64")}) format("woff2-variations")}`;

export const cssUrl = (css: string) => new URL(`data:text/css,${encodeURIComponent(css)}`);

export const renderOptions = ({
  hash,
  theme,
  pageFont
}: {
  hash: string;
  theme: DiagramTheme;
  pageFont: URL;
}) =>
  ({
    backgroundColor: THEMES[theme].background,
    // "strict" means no click callbacks and escaped labels; the files are also served directly.
    mermaidConfig: {
      theme: THEMES[theme].mermaid,
      securityLevel: "strict",
      fontFamily: "Fira Code, ui-monospace, monospace"
    },
    customFontCSS: [{ cssUrl: pageFont }],
    svgId: `m-${hash}-${theme}`
  }) satisfies ParseMDDOptions;

export function usedText(svg: string): string {
  const text = svg
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/g, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/&[a-z#0-9]+;/gi, " ");
  return [...new Set(text)].join("");
}

const STAMP_ATTR = "data-renderer";

export const stampOf = (svg: string): string | undefined =>
  svg.slice(0, 2048).match(new RegExp(`\\b${STAMP_ATTR}="([^"]*)"`))?.[1];

export const finishSvg = ({ svg, stamp, subset }: { svg: string; stamp: string; subset: Buffer }) =>
  svg
    .replace(/<svg\b/, `<svg ${STAMP_ATTR}="${stamp}"`)
    .replace(/<svg\b[^>]*>/, open => `${open}<style>${fontFace(subset)}</style>`);
