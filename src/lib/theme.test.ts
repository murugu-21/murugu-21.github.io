import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bootstrapTheme, currentTheme, type Theme } from "./theme";

class FakeQuery extends EventTarget {
  constructor(public matches: boolean) {
    super();
  }
}

// A page as the bootstrap sees it, with `isDark` and the OS preference preset.
class FakePage extends EventTarget {
  document = parseHTML("<html><body></body></html>").document;
  stored = new Map<string, string>();
  blocked: boolean;
  localStorage = {
    getItem: (key: string) => this.storage().get(key) ?? null,
    setItem: (key: string, value: string) => void this.storage().set(key, value),
    removeItem: (key: string) => void this.storage().delete(key)
  };
  os: FakeQuery;
  matchMedia = () => this.os;
  __setPreferredTheme: (theme: Theme) => void = () => {
    throw new Error("bootstrap not run");
  };
  themechanges = 0;

  constructor({
    isDark,
    osDark = false,
    blocked = false
  }: {
    isDark: string | null;
    osDark?: boolean;
    blocked?: boolean;
  }) {
    super();
    this.blocked = blocked;
    if (isDark !== null) this.stored.set("isDark", isDark);
    this.os = new FakeQuery(osDark);
    this.addEventListener("themechange", () => {
      this.themechanges++;
    });
  }

  // Safari private mode and blocked site data throw on any access
  private storage() {
    if (this.blocked) throw new Error("SecurityError");
    return this.stored;
  }

  get dark() {
    return this.document.documentElement.classList.contains("dark-mode");
  }

  flipOs() {
    this.os.matches = !this.os.matches;
    this.os.dispatchEvent(new Event("change"));
  }

  // the Workers pool has no PageTransitionEvent
  show(persisted: boolean) {
    this.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));
  }
}

describe("bootstrapTheme", () => {
  it.each([
    { isDark: "true", osDark: false, dark: true },
    { isDark: "false", osDark: true, dark: false },
    { isDark: null, osDark: true, dark: true },
    { isDark: null, osDark: false, dark: false },
    { isDark: "{oops", osDark: true, dark: true }
  ])(
    "isDark=$isDark, OS dark=$osDark: dark=$dark, storage untouched",
    ({ isDark, osDark, dark }) => {
      const page = new FakePage({ isDark, osDark });
      bootstrapTheme(page);
      expect(page.dark).toBe(dark);
      expect(page.stored.get("isDark")).toBe(isDark ?? undefined);
    }
  );

  it("applies, stores and announces a toggle", () => {
    const page = new FakePage({ isDark: null });
    bootstrapTheme(page);
    page.__setPreferredTheme("dark");
    expect(page.dark).toBe(true);
    expect(page.stored.get("isDark")).toBe("true");
    expect(page.themechanges).toBe(1);
  });

  it("follows an OS flip after load and drops the stored choice", () => {
    const page = new FakePage({ isDark: "false", osDark: false });
    bootstrapTheme(page);
    page.flipOs();
    expect(page.dark).toBe(true);
    expect(page.stored.has("isDark")).toBe(false);
    expect(page.themechanges).toBe(1);
  });

  it("still follows the OS and toggles when storage is blocked", () => {
    const page = new FakePage({ isDark: null, osDark: true, blocked: true });
    bootstrapTheme(page);
    expect(page.dark).toBe(true);
    page.__setPreferredTheme("light");
    expect(page.dark).toBe(false);
    expect(page.themechanges).toBe(1);
  });

  it("re-applies a choice stored on another page when restored from bfcache", () => {
    const page = new FakePage({ isDark: "false" });
    bootstrapTheme(page);
    page.stored.set("isDark", "true");
    page.show(false);
    expect(page.dark).toBe(false);
    page.show(true);
    expect(page.dark).toBe(true);
    expect(page.themechanges).toBe(1);
    page.show(true);
    expect(page.themechanges).toBe(1);
  });

  it("applies the OS preference on a bfcache restore without storing it", () => {
    const page = new FakePage({ isDark: null, osDark: false });
    bootstrapTheme(page);
    page.os.matches = true;
    page.show(true);
    expect(page.dark).toBe(true);
    expect(page.stored.has("isDark")).toBe(false);
  });
});

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
