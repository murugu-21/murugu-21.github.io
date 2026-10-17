/// <reference types="vite-plus/test/browser-playwright" />
import { afterEach, expect, it } from "vite-plus/test";
import { cdp } from "vite-plus/test/browser";

import { bootstrapTheme } from "#src/lib/theme.ts";

import { plainGlobalCss } from "./plain-global-css.ts";

const mounted: Element[] = [];
afterEach(async () => {
  await cdp().send("Emulation.setEmulatedMedia", { media: "" });
  for (const el of mounted) el.remove();
  mounted.length = 0;
  document.documentElement.classList.remove("dark-mode");
  localStorage.removeItem("isDark");
});

const mountProbe = () => {
  const style = document.createElement("style");
  style.textContent = plainGlobalCss;
  const probe = document.createElement("div");
  probe.style.color = "light-dark(rgb(1, 2, 3), rgb(4, 5, 6))";
  document.head.append(style);
  document.body.append(probe);
  mounted.push(style, probe);
  bootstrapTheme(window);
  return probe;
};

it("the theme toggle flips color-scheme, and light-dark() colours with it", () => {
  const probe = mountProbe();
  window.__setPreferredTheme("light");
  expect(getComputedStyle(document.documentElement).colorScheme).toBe("light");
  expect(getComputedStyle(probe).color).toBe("rgb(1, 2, 3)");

  window.__setPreferredTheme("dark");
  expect(getComputedStyle(document.documentElement).colorScheme).toBe("dark");
  expect(getComputedStyle(probe).color).toBe("rgb(4, 5, 6)");
});

it("printing in the dark theme resolves light-dark() to the light side", async () => {
  const probe = mountProbe();
  window.__setPreferredTheme("dark");
  expect(getComputedStyle(probe).color).toBe("rgb(4, 5, 6)");

  await cdp().send("Emulation.setEmulatedMedia", { media: "print" });
  expect(getComputedStyle(document.documentElement).colorScheme).toBe("light");
  expect(getComputedStyle(probe).color).toBe("rgb(1, 2, 3)");
});
