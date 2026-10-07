import type { Root } from "hast";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { describe, expect, it } from "vitest";

import { autolinkConfig } from "./rehype-autolink-config";

describe("autolinkConfig", () => {
  it("prepends a hidden, untabbable anchor with a link icon to each heading", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "h2",
          properties: { id: "why" },
          children: [{ type: "text", value: "Why" }]
        }
      ]
    };

    rehypeAutolinkHeadings(autolinkConfig)(tree);

    const [heading] = tree.children;
    expect(heading).toMatchObject({
      tagName: "h2",
      children: [
        {
          tagName: "a",
          properties: { href: "#why", class: "anchor", ariaHidden: "true", tabIndex: -1 },
          children: [{ tagName: "svg", properties: { ariaHidden: "true", width: 16 } }]
        },
        { type: "text", value: "Why" }
      ]
    });
  });
});
