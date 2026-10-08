import { describe, expect, it } from "vitest";

import { CONTINUE_KEY, redirectIfOutdated, wireContinueLink } from "./browser-support";

type Features = { lightDark?: boolean; registerProperty?: boolean; popover?: boolean };

/** A window with the floor's features, minus any switched off, that records redirects. */
function browser({ features = {}, name = "" }: { features?: Features; name?: string } = {}) {
  const { lightDark = true, registerProperty = true, popover = true } = features;
  const redirects: string[] = [];
  const win = {
    CSS: {
      supports: (_property: string, value: string) => !value.startsWith("light-dark(") || lightDark,
      ...(registerProperty ? { registerProperty: () => {} } : {})
    },
    HTMLElement: { prototype: popover ? { popover: null } : {} },
    name,
    location: {
      pathname: "/blog/react/",
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
    redirectIfOutdated(supported.win, CONTINUE_KEY);
    expect(supported.redirects).toEqual([]);

    for (const missing of ["lightDark", "registerProperty", "popover"] as const) {
      const old = browser({ features: { [missing]: false } });
      redirectIfOutdated(old.win, CONTINUE_KEY);
      expect(old.redirects, missing).toEqual([NOTICE]);
    }
  });

  it("sends a browser with no CSS object at all, like IE11, to the notice", () => {
    const { win, redirects } = browser();
    redirectIfOutdated({ ...win, CSS: undefined }, CONTINUE_KEY);
    expect(redirects).toEqual([NOTICE]);
  });
});

describe("wireContinueLink", () => {
  // An <a> resolves an href with the URL parser, as the browser's own does.
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
    const link: { href: string; onclick: (() => void) | null } = { href: "/", onclick: null };
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
    redirectIfOutdated(continued.win, CONTINUE_KEY);
    const fresh = browser({ features: { popover: false } });
    redirectIfOutdated(fresh.win, CONTINUE_KEY);

    expect([continued.redirects, fresh.redirects]).toEqual([[], [NOTICE]]);
  });
});
