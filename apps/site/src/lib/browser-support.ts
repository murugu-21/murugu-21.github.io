export const MIN_VERSIONS = {
  chrome: "123",
  edge: "123",
  firefox: "128",
  safari: "17.5",
  ios: "17.5"
} as const;

export const BROWSER_TARGETS = Object.entries(MIN_VERSIONS).map(
  ([browser, version]) => `${browser}${version}`
);

// Stored in window.name, which browsers clear when the tab leaves the site.
export const CONTINUE_KEY = "outdatedBrowserContinue";

// Both functions below are inlined via toString() into pages old browsers load, so each body is
// self-contained ES5 (browser-support.test.ts parses them as ES5).

export interface BrowserCss {
  supports: (property: string, value: string) => boolean;
  registerProperty?: (definition: PropertyDefinition) => void;
}

interface BrowserHost {
  CSS?: BrowserCss;
  HTMLElement: { prototype: object };
  name: string;
  location: Pick<Location, "pathname" | "search" | "hash" | "replace">;
}

export function redirectIfOutdated(win: BrowserHost, continueKey: string): void {
  if (win.name === continueKey) return;
  var css = win.CSS;
  var supported =
    css !== undefined &&
    css.supports("color", "light-dark(#000, #fff)") &&
    // @property, which Tailwind 4 needs
    css.registerProperty !== undefined &&
    "popover" in win.HTMLElement.prototype;
  if (supported) return;
  var where = win.location;
  where.replace(
    "/outdated/?from=" + encodeURIComponent(where.pathname + where.search + where.hash)
  );
}

export const outdatedRedirectScript = `(${redirectIfOutdated.toString()})(window, ${JSON.stringify(CONTINUE_KEY)});`;

export interface NoticeLink {
  href: string;
  onclick: (() => void) | null;
}

interface NoticeHost {
  document: {
    getElementById: (id: string) => NoticeLink | null;
    createElement: (tag: "a") => NoticeLink;
  };
  location: Pick<Location, "search" | "protocol" | "host">;
  name: string;
}

export function wireContinueLink(win: NoticeHost, continueKey: string): void {
  var link = win.document.getElementById("continue");
  if (!link) return;
  var from = "/";
  var match = /[?&]from=([^&]*)/.exec(win.location.search);
  try {
    // oxlint-disable-next-line unicorn/prefer-string-replace-all -- replaceAll is ES2021
    if (match && match[1]) from = decodeURIComponent(match[1].replace(/\+/g, " "));
    // oxlint-disable-next-line no-unused-vars -- ES5 has no optional catch binding
  } catch (malformed) {
    // a broken escape: go home
  }
  // Resolved by the browser's own parser, the one that will follow the link. It turns "//host",
  // "/\\host" and "/\t/host" into other sites, so only a URL on this origin is kept.
  var anchor = win.document.createElement("a");
  anchor.href = from;
  var home = win.location.protocol + "//" + win.location.host + "/";
  link.href = anchor.href.indexOf(home) === 0 ? anchor.href : "/";
  link.onclick = function () {
    win.name = continueKey;
  };
}

export const continueLinkScript = `(${wireContinueLink.toString()})(window, ${JSON.stringify(CONTINUE_KEY)});`;
