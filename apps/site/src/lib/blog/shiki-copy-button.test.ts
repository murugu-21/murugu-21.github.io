import { parseHTML } from "linkedom";
import { codeToHtml } from "shiki";
import { expect, it } from "vite-plus/test";

import { speechBlocks } from "@murugappan/content/speech.ts";

import { copyButton } from "./shiki-copy-button";

const render = async (prose: string) => {
  const code = 'const greeting = "hi";\nconsole.log(greeting);';
  const html = await codeToHtml(code, {
    lang: "ts",
    theme: "night-owl",
    transformers: [copyButton]
  });
  return parseHTML(`<!doctype html><html><body>${html}${prose}</body></html>`).document;
};

it("wraps a fence in a figure beside a copy button", async () => {
  const document = await render("");

  const [figure] = document.body.children;
  expect(figure.tagName).toBe("FIGURE");
  expect([...figure.children].map(child => child.tagName)).toEqual(["PRE", "BUTTON"]);
  expect(figure.querySelector("button")?.getAttribute("aria-label")).toBe("Copy code");
});

it("keeps the fence and its button out of read-aloud", async () => {
  const document = await render("<p>Then log it.</p>");
  expect(speechBlocks(document.body).map(block => block.text)).toEqual(["Then log it."]);
});

it("marks the fence for read-aloud to skip", async () => {
  const document = await render("");

  const [figure] = document.body.children;
  expect(figure.getAttribute("data-speech-skip")).toBe("");
});
