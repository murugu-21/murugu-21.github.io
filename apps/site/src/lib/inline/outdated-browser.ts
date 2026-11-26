import { inlineScript } from "./inline-script";

// Stored in window.name, which browsers clear when the tab leaves the site.
export const CONTINUE_KEY = "outdatedBrowserContinue";

export const NOTICE_PATH = "/outdated/";

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

export function redirectIfOutdated(
  win: BrowserHost,
  continueKey: string,
  noticePath: string
): void {
  if (win.name === continueKey) return;
  var where = win.location;
  if (where.pathname === noticePath) return;
  var css = win.CSS;
  var hasLightDark = css !== undefined && css.supports("color", "light-dark(#000, #fff)");
  var hasAtProperty = css !== undefined && css.registerProperty !== undefined;
  var hasPopover = "popover" in win.HTMLElement.prototype;
  if (hasLightDark && hasAtProperty && hasPopover) return;
  where.replace(
    noticePath + "?from=" + encodeURIComponent(where.pathname + where.search + where.hash)
  );
}

export const outdatedRedirectScript = inlineScript({
  run: redirectIfOutdated,
  args: [CONTINUE_KEY, NOTICE_PATH],
  syntax: "es5"
});

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
  var home = "/";
  var match = /[?&]from=([^&]*)/.exec(win.location.search);
  var from;
  try {
    from =
      match && match[1]
        ? // oxlint-disable-next-line unicorn/prefer-string-replace-all -- replaceAll is ES2021
          decodeURIComponent(match[1].replace(/\+/g, " "))
        : home;
    // oxlint-disable-next-line no-unused-vars -- ES5 has no optional catch binding
  } catch (brokenEscape) {
    from = home;
  }
  // Resolved by the browser's own parser, the one that will follow the link. It turns "//host",
  // "/\\host" and "/\t/host" into other sites, so only a URL on this origin is kept.
  var anchor = win.document.createElement("a");
  anchor.href = from;
  var siteRoot = win.location.protocol + "//" + win.location.host + "/";
  link.href = anchor.href.indexOf(siteRoot) === 0 ? anchor.href : home;
  link.onclick = function () {
    win.name = continueKey;
  };
}

export const continueLinkScript = inlineScript({
  run: wireContinueLink,
  args: [CONTINUE_KEY],
  syntax: "es5"
});
