import { describe, expect, it } from "vite-plus/test";

import { exists } from "@murugappan/utils/node/fs.ts";

import {
  CONTINUE_KEY,
  NOTICE_PATH,
  redirectIfOutdated,
  wireContinueLink,
  type BrowserCss,
  type NoticeLink
} from "./outdated-browser";

type Features = { lightDark?: boolean; registerProperty?: boolean; popover?: boolean };

function browser({
  features = {},
  name = "",
  pathname = "/blog/react/"
}: { features?: Features; name?: string; pathname?: string } = {}) {
  const { lightDark = true, registerProperty = true, popover = true } = features;
  const redirects: string[] = [];
  const css: BrowserCss = {
    supports: (_property, value) => !value.startsWith("light-dark(") || lightDark
  };
  if (registerProperty) css.registerProperty = () => {};
  const win = {
    CSS: css,
    HTMLElement: { prototype: popover ? { popover: null } : {} },
    name,
    location: {
      pathname,
      search: "?q=hooks",
      hash: "#effects",
      replace: (url: string) => redirects.push(url)
    }
  };
  return { win, redirects };
}

const NOTICE = "/outdated/?from=%2Fblog%2Freact%2F%3Fq%3Dhooks%23effects";

describe("redirectIfOutdated", () => {
  it("leaves a supported browser on the page and sends one missing any floor feature to the notice", () => {
    const supported = browser();
    redirectIfOutdated(supported.win, CONTINUE_KEY, NOTICE_PATH);
    expect(supported.redirects).toEqual([]);

    for (const missing of ["lightDark", "registerProperty", "popover"] as const) {
      const old = browser({ features: { [missing]: false } });
      redirectIfOutdated(old.win, CONTINUE_KEY, NOTICE_PATH);
      expect(old.redirects, missing).toEqual([NOTICE]);
    }
  });

  it("sends a browser with no CSS object at all, like IE11, to the notice", () => {
    const { win, redirects } = browser();
    redirectIfOutdated({ ...win, CSS: undefined }, CONTINUE_KEY, NOTICE_PATH);
    expect(redirects).toEqual([NOTICE]);
  });

  it("leaves an outdated browser on the notice page itself, so it can't redirect in a loop", () => {
    const onNotice = browser({ features: { popover: false }, pathname: "/outdated/" });
    redirectIfOutdated(onNotice.win, CONTINUE_KEY, NOTICE_PATH);
    const elsewhere = browser({ features: { popover: false }, pathname: "/blog/react/" });
    redirectIfOutdated(elsewhere.win, CONTINUE_KEY, NOTICE_PATH);

    expect([onNotice.redirects, elsewhere.redirects]).toEqual([[], [NOTICE]]);
  });

  it("names the path the notice page is built at", async () => {
    const page = new URL(`../../pages${NOTICE_PATH.replace(/\/$/, "")}.astro`, import.meta.url);
    expect(await exists(page), page.pathname).toBe(true);
  });
});

describe("wireContinueLink", () => {
  const anchor = () => {
    let resolved = "";
    return {
      get href() {
        return resolved;
      },
      set href(value: string) {
        resolved = new URL(value, "https://murugappan.dev/outdated/?from=x").href;
      },
      onclick: null
    };
  };

  const notice = (search: string) => {
    const link: NoticeLink = { href: "/", onclick: null };
    const tab = {
      document: {
        getElementById: (id: string) => (id === "continue" ? link : null),
        createElement: anchor
      },
      location: { search, protocol: "https:", host: "murugappan.dev" },
      name: ""
    };
    wireContinueLink(tab, CONTINUE_KEY);
    return { link, tab };
  };

  it.each([
    [
      "?from=%2Fblog%2Freact%2F%3Fq%3Dhooks%23effects",
      "https://murugappan.dev/blog/react/?q=hooks#effects"
    ],
    ["", "https://murugappan.dev/"],
    ["?from=%E0%A4%A", "https://murugappan.dev/"],
    ["?from=https%3A%2F%2Fevil.example%2F", "/"],
    ["?from=%2F%2Fevil.example%2F", "/"],
    ["?from=%2F%5Cevil.example%2F", "/"],
    ["?from=%2F%09%2Fevil.example%2F", "/"],
    ["?from=%2F%0A%2Fevil.example%2F", "/"],
    ["?from=javascript%3Aalert(1)", "/"],
    ["?from=", "https://murugappan.dev/"]
  ])("points %j at %s", (search, href) => {
    expect(notice(search).link.href).toBe(href);
  });

  it("lets a tab that followed the link past the check, and only that tab", () => {
    const { link, tab } = notice("?from=%2Fblog%2Freact%2F");
    link.onclick?.();
    const continued = browser({ features: { popover: false }, name: tab.name });
    redirectIfOutdated(continued.win, CONTINUE_KEY, NOTICE_PATH);
    const fresh = browser({ features: { popover: false } });
    redirectIfOutdated(fresh.win, CONTINUE_KEY, NOTICE_PATH);

    expect([continued.redirects, fresh.redirects]).toEqual([[], [NOTICE]]);
  });
});
