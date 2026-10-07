import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { jsonLdHtml } from "./schema";

vi.mock("astro:env/server", () => ({ RESUME_PHONE: undefined }));

const Graph = z.object({
  "@context": z.string(),
  "@graph": z.array(z.looseObject({ "@type": z.string(), "@id": z.string().optional() }))
});

const parseGraph = (html: string) => Graph.parse(JSON.parse(html));

describe("jsonLdHtml", () => {
  it("always carries the site and the person, and adds a WebPage node for an indexable page", () => {
    const graph = parseGraph(
      jsonLdHtml({
        page: { url: "https://murugappan.dev/resume/", name: "Resume", profilePage: false },
        nodes: []
      })
    );

    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"].map(n => [n["@type"], n["@id"]])).toEqual([
      ["WebSite", "https://murugappan.dev/#website"],
      ["Person", "https://murugappan.dev/#person"],
      ["WebPage", "https://murugappan.dev/resume/"]
    ]);
  });

  it("omits the page node for a noindex page and appends the page's own nodes", () => {
    const graph = parseGraph(
      jsonLdHtml({
        page: null,
        nodes: [{ "@type": "Blog", "@id": "https://murugappan.dev/blog/#blog" }]
      })
    );

    expect(graph["@graph"].map(n => n["@type"])).toEqual(["WebSite", "Person", "Blog"]);
  });

  it("points a profile page at the person", () => {
    const graph = parseGraph(
      jsonLdHtml({
        page: { url: "https://murugappan.dev/about/", name: "About", profilePage: true },
        nodes: []
      })
    );

    expect(graph["@graph"][2]).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: { "@id": "https://murugappan.dev/#person" }
    });
  });

  it("deduplicates the skills the person knows about, ignoring case", () => {
    const person = parseGraph(jsonLdHtml({ page: null, nodes: [] }))["@graph"][1];
    const knowsAbout = z.array(z.string()).parse(person?.knowsAbout);
    const lowered = knowsAbout.map(term => term.toLowerCase());

    expect(knowsAbout.slice(0, 2)).toEqual(["TypeScript", "Node.js"]);
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("escapes < so a post title cannot close the script block", () => {
    const html = jsonLdHtml({
      page: { url: "https://murugappan.dev/", name: "</script><b>", profilePage: false },
      nodes: []
    });

    expect(html).not.toContain("<");
    expect(html).toContain("\\u003c/script>\\u003cb>");
  });
});
