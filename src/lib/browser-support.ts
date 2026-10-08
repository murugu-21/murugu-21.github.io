// The supported browser versions, in one place. README.md, "Browser support", explains the floor.

export const MIN_VERSIONS = {
  chrome: "123",
  edge: "123",
  firefox: "128",
  safari: "17.5",
  ios: "17.5"
} as const;

/** Vite's target names, e.g. "safari17.5". */
export const BROWSER_TARGETS = Object.entries(MIN_VERSIONS).map(
  ([browser, version]) => `${browser}${version}`
);

/** The tab's window.name once the visitor chose "continue anyway". Browsers clear it when the tab
 * leaves the site, so it lasts until then or until the tab closes. */
export const CONTINUE_KEY = "outdatedBrowserContinue";

// Both functions below are inlined into pages via toString() and run in the old browsers they
// exist for, so their bodies stay ES5: var, function expressions, string concatenation, no URL
// API. browser-support.node.test.ts parses the inlined scripts as ES5 to keep it that way.

interface BrowserHost {
  CSS?: { supports: (property: string, value: string) => boolean; registerProperty?: unknown };
  HTMLElement: { prototype: object };
  name: string;
  location: Pick<Location, "pathname" | "search" | "hash" | "replace">;
}

/**
 * Sends a browser below MIN_VERSIONS to /outdated/ before first paint, by checking the features
 * that set each floor rather than the user agent. It must not reference anything outside itself.
 */
export function redirectIfOutdated(win: BrowserHost, continueKey: string): void {
  if (win.name === continueKey) return;
  var css = win.CSS;
  var supported =
    css !== undefined &&
    // every light/dark colour pair
    css.supports("color", "light-dark(#000, #fff)") &&
    // @property, which Tailwind 4 needs
    typeof css.registerProperty === "function" &&
    // the phone menu
    "popover" in win.HTMLElement.prototype;
  if (supported) return;
  var where = win.location;
  where.replace(
    "/outdated/?from=" + encodeURIComponent(where.pathname + where.search + where.hash)
  );
}

export const outdatedRedirectScript = `(${redirectIfOutdated.toString()})(window, ${JSON.stringify(CONTINUE_KEY)});`;

interface NoticeLink {
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

/**
 * Points the notice's "continue anyway" link back at the page the visitor asked for, and skips
 * the check in this tab once they follow it. It must not reference anything outside itself.
 */
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
