import { parseHTML } from "linkedom";
import { codeToHtml } from "shiki";
import { expect, it } from "vite-plus/test";

import { copyButton } from "./shiki-copy-button";

it("wraps a fence in a figure beside a copy button", async () => {
  const code = 'const greeting = "hi";\nconsole.log(greeting);';
  const html = await codeToHtml(code, {
    lang: "ts",
    theme: "night-owl",
    transformers: [copyButton]
  });
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);

  const [figure] = document.body.children;
  expect(figure.tagName).toBe("FIGURE");
  expect([...figure.children].map(child => child.tagName)).toEqual(["PRE", "BUTTON"]);
  expect(figure.querySelector("button")?.getAttribute("aria-label")).toBe("Copy code");
});
