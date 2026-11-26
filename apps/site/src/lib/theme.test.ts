import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { currentTheme } from "./theme";

describe("currentTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the theme the page is showing from its root class", () => {
    const { document } = parseHTML("<html><body></body></html>");
    vi.stubGlobal("document", document);

    expect(currentTheme()).toBe("light");
    document.documentElement.classList.add("dark-mode");
    expect(currentTheme()).toBe("dark");
  });
});
