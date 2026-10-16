import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { jsonLdHtml, knowsAbout } from "./schema";

const Graph = z.object({
  "@context": z.string(),
  "@graph": z.array(z.looseObject({ "@type": z.string(), "@id": z.string().optional() }))
});

const parseGraph = (html: string) => Graph.parse(JSON.parse(html));
const Person = z.object({ "@type": z.literal("Person"), knowsAbout: z.array(z.string()) });

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

  it("points a profile page at the person, and only a profile page", () => {
    const pageNode = (profilePage: boolean) =>
      parseGraph(
        jsonLdHtml({
          page: { url: "https://murugappan.dev/about/", name: "About", profilePage },
          nodes: []
        })
      )["@graph"][2];

    expect(pageNode(true)).toMatchObject({
      "@type": "ProfilePage",
      mainEntity: { "@id": "https://murugappan.dev/#person" }
    });
    expect(pageNode(false)).not.toHaveProperty("mainEntity");
  });

  it("lists the resume's skills, not just the hand-written ones, in the person's knowsAbout", () => {
    const { knowsAbout: terms } = Person.parse(
      parseGraph(jsonLdHtml({ page: null, nodes: [] }))["@graph"][1]
    );

    expect(terms).toContain("TypeScript");
    expect(terms).toContain("Terraform");
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

describe("knowsAbout", () => {
  it("keeps one entry per skill, ignoring case, in the hand-written casing", () => {
    const terms = knowsAbout([{ items: "typescript, Rust" }]);

    expect(terms.filter(term => term.toLowerCase() === "typescript")).toEqual(["TypeScript"]);
    expect(terms).toContain("Rust");
  });
});
