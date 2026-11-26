import { parseHTML } from "linkedom";
import { describe, expect, it } from "vite-plus/test";

import { text } from "./server.ts";

describe("blog post links", () => {
  it("opens links to other sites in a new tab and keeps this site's links in place", async () => {
    const { document } = parseHTML(await text("/blog/gatsby-to-astro/"));
    const linkAttributes = (href: string) => {
      const link = document.querySelector(`section[data-post-body] a[href="${href}"]`);
      return { target: link?.getAttribute("target"), rel: link?.getAttribute("rel") };
    };

    expect(linkAttributes("https://github.com/gatsbyjs/gatsby/discussions/39062")).toEqual({
      target: "_blank",
      rel: "noopener noreferrer"
    });
    expect(linkAttributes("https://murugappan.dev/blog/gastby/")).toEqual({
      target: null,
      rel: null
    });
    expect(linkAttributes("#state-of-gatsby")).toEqual({ target: null, rel: null });
  });
});

describe("inline head scripts", () => {
  it("inlines the redirect, theme and shared-element scripts in a post's head", async () => {
    const { document } = parseHTML(await text("/blog/gatsby-to-astro/"));
    const openings = [...document.head.querySelectorAll("script:not([src]):not([type])")].map(
      script => /^\(function \w+\(/.exec(script.textContent ?? "")?.[0]
    );

    expect(openings).toEqual([
      "(function redirectIfOutdated(",
      "(function bootstrapTheme(",
      "(function pairSharedElements("
    ]);
    const pages = await Promise.all(
      ["/", "/about/", "/blog/", "/blog/gatsby-to-astro/", "/developers/"].map(text)
    );
    expect(pages.filter(html => html.includes("[object Object]"))).toEqual([]);
  });
});
