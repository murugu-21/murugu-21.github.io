import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { cssUrl, finishSvg, renderOptions, stampOf, usedText } from "./mermaid-svg.ts";

describe("finishSvg", () => {
  it("stamps the SVG with its renderer and embeds the font subset, and stampOf reads it back", () => {
    const svg = finishSvg({
      svg: '<svg id="m-abc-light" viewBox="0 0 10 10"><g>Hi</g></svg>',
      stamp: "mermaid@11.12.0",
      subset: Buffer.from("font")
    });
    expect(svg).toBe(
      '<svg data-renderer="mermaid@11.12.0" id="m-abc-light" viewBox="0 0 10 10"><style>' +
        '@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;' +
        'src:url(data:font/woff2;base64,Zm9udA==) format("woff2-variations")}' +
        "</style><g>Hi</g></svg>"
    );
    expect(stampOf(svg)).toBe("mermaid@11.12.0");
    expect(stampOf('<svg id="m-abc-light"><g>Hi</g></svg>')).toBe(undefined);
  });
});

describe("usedText", () => {
  it("keeps each label character once, without the stylesheet's or entities' characters", () => {
    expect(usedText("<svg><style>.node{fill:#fff}</style><text>Ab &amp; bad</text></svg>")).toBe(
      " Abad"
    );
  });
});

describe("renderOptions", () => {
  it("renders the theme strictly in the page font, under an id from the hash and theme", () => {
    const pageFont = cssUrl("body{margin:0}");
    expect(pageFont.href).toBe("data:text/css,body%7Bmargin%3A0%7D");
    expect(renderOptions({ hash: "abc123", theme: "dark", pageFont })).toEqual({
      backgroundColor: "#282c35",
      mermaidConfig: {
        theme: "dark",
        securityLevel: "strict",
        fontFamily: "Fira Code, ui-monospace, monospace"
      },
      customFontCSS: [{ cssUrl: new URL("data:text/css,body%7Bmargin%3A0%7D") }],
      svgId: "m-abc123-dark"
    });
  });
});
