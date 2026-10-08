// The theme mechanism end to end in a real browser: the toggle sets
// `html.dark-mode`, global.css turns that into `color-scheme`, and a
// `light-dark()` colour follows. The stylesheet is inlined by vitest.config.ts,
// which routes `.tsx` tests (this one has no JSX) to the browser project.
import { afterEach, expect, test } from "vitest";

import { bootstrapTheme } from "#src/lib/theme.ts";

declare const __GLOBAL_CSS__: string;

// Unprocessed Tailwind at-rules (@import, @theme, @utility) are ignored by the
// browser, which leaves the plain rules this test needs: the `color-scheme`
// pair on html. The imports are cut so the browser doesn't try to fetch them.
const plain = (css: string) => css.replaceAll(/@import [^;]+;/g, "");

const mounted: Element[] = [];
afterEach(() => {
  for (const el of mounted) el.remove();
  mounted.length = 0;
  document.documentElement.classList.remove("dark-mode");
  localStorage.removeItem("isDark");
});

test("the theme toggle flips color-scheme, and light-dark() colours with it", () => {
  const style = document.createElement("style");
  style.textContent = plain(__GLOBAL_CSS__);
  const probe = document.createElement("div");
  probe.style.color = "light-dark(rgb(1, 2, 3), rgb(4, 5, 6))";
  document.head.append(style);
  document.body.append(probe);
  mounted.push(style, probe);

  bootstrapTheme(window);
  window.__setPreferredTheme("light");
  expect(getComputedStyle(document.documentElement).colorScheme).toBe("light");
  expect(getComputedStyle(probe).color).toBe("rgb(1, 2, 3)");

  window.__setPreferredTheme("dark");
  expect(getComputedStyle(document.documentElement).colorScheme).toBe("dark");
  expect(getComputedStyle(probe).color).toBe("rgb(4, 5, 6)");
});
