/// <reference types="vite-plus/test/browser-playwright" />
import { afterEach, expect, it } from "vite-plus/test";

import { plainGlobalCss } from "./plain-global-css.ts";

const mounted: Element[] = [];
afterEach(() => {
  for (const el of mounted) el.remove();
  mounted.length = 0;
});

const mountPage = (html: string) => {
  const style = document.createElement("style");
  style.textContent = plainGlobalCss;
  const page = document.createElement("div");
  page.innerHTML = html;
  document.head.append(style);
  document.body.append(page);
  mounted.push(style, page);
  return page;
};

const lineHeight = ({ page, selector }: { page: Element; selector: string }) => {
  const el = page.querySelector(selector);
  if (!el) throw new Error(`no ${selector} on the page`);
  return getComputedStyle(el).lineHeight;
};

it("sets copy in <main> to 1.5, and leaves prose and the chrome outside <main> theirs", () => {
  const page = mountPage(`
    <div style="font-size: 16px; line-height: 20px">
      <nav><ul><li data-nav>Blogs</li></ul></nav>
      <main>
        <p data-copy>Copy</p>
        <ul><li data-item>Item</li></ul>
        <article class="prose" style="line-height: 1.75"><p data-prose>Prose</p></article>
      </main>
    </div>`);

  expect(lineHeight({ page, selector: "[data-copy]" })).toBe("24px");
  expect(lineHeight({ page, selector: "[data-item]" })).toBe("24px");
  expect(lineHeight({ page, selector: "[data-prose]" })).toBe("28px");
  expect(lineHeight({ page, selector: "[data-nav]" })).toBe("20px");
});
