/// <reference types="vite-plus/test/browser-playwright" />
import { afterEach, expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser";

import { plainGlobalCss } from "./plain-global-css.ts";

const mounted: Element[] = [];
afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { media: "" });
  for (const el of mounted) el.remove();
  mounted.length = 0;
});

const mountSheet = () => {
  const style = document.createElement("style");
  style.textContent = plainGlobalCss;
  document.head.append(style);
  mounted.push(style);
};

const mountLink = ({ target, html }: { target?: string; html: string }) => {
  const link = document.createElement("a");
  link.href = "https://example.com/";
  if (target) link.target = target;
  link.innerHTML = html;
  document.body.append(link);
  mounted.push(link);
  return link;
};

const afterContent = (el: Element) => getComputedStyle(el, "::after").content;

it("marks only text links that open in a new tab", () => {
  mountSheet();
  const text = mountLink({ target: "_blank", html: "GitHub" });
  const icon = mountLink({ target: "_blank", html: "<svg></svg>" });
  const empty = mountLink({ target: "_blank", html: "" });
  const sameTab = mountLink({ html: "Blog" });

  expect(afterContent(text)).toBe('"↗" / " (opens in new tab)"');
  expect(afterContent(icon)).toBe("none");
  expect(afterContent(empty)).toBe("none");
  expect(afterContent(sameTab)).toBe("none");
});

it("drops the arrow when printing", async () => {
  mountSheet();
  const text = mountLink({ target: "_blank", html: "GitHub" });
  expect(afterContent(text)).toBe('"↗" / " (opens in new tab)"');

  await cdp().send("Emulation.setEmulatedMedia", { media: "print" });
  expect(afterContent(text)).toBe("none");
});
