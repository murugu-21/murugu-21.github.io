// What render-mermaid.ts asks mermaid-cli for, and what it adds to each SVG:
// a stamp naming the mermaid that rendered it and an embedded Fira Code subset.
import type { Buffer } from "node:buffer";
import type { ParseMDDOptions } from "@mermaid-js/mermaid-cli";

import type { DiagramTheme } from "#src/lib/blog/mermaid-diagrams.ts";

// Background matches post.css's card (dark is --color-dark-bg).
export const THEMES: Record<DiagramTheme, { mermaid: "neutral" | "dark"; background: string }> = {
  light: { mermaid: "neutral", background: "#fff" },
  dark: { mermaid: "dark", background: "#282c35" }
};

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
    // The id lands in the SVG and its stylesheet, so it derives from the hash (not
    // a counter) to keep re-renders byte-identical. Ids needn't be unique across files.
    svgId: `m-${hash}-${theme}`
  }) satisfies ParseMDDOptions;

// Text between tags, minus the inline stylesheet (whose selectors would bloat
// the subset). A small superset of the labels is fine.
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
