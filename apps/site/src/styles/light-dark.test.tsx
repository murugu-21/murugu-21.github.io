// The theme mechanism end to end in a real browser: the toggle sets
// `html.dark-mode`, global.css turns that into `color-scheme`, and a
// `light-dark()` colour follows. vitest.config.ts routes `.tsx` tests (this one
// has no JSX) to the browser project.
/// <reference types="@vitest/browser-playwright" />
import { afterEach, expect, it } from "vitest";
import { cdp } from "vitest/browser";

import { bootstrapTheme } from "#src/lib/theme.ts";

import css from "./global.css?raw";

// Unprocessed Tailwind at-rules (@import, @theme, @utility) are ignored by the
// browser, which leaves the plain rules this test needs: the `color-scheme`
// pair on html. The imports are cut so the browser doesn't try to fetch them.
const plain = (sheet: string) => sheet.replaceAll(/@import [^;]+;/g, "");

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
  style.textContent = plain(css);
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
