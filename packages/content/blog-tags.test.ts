import { describe, expect, it } from "vite-plus/test";

import { BlogFrontmatter } from "@murugappan/contracts/blog.ts";
import README from "./blog/README.md?raw";

describe("BlogFrontmatter tags", () => {
  /* oxlint-disable tests/observe-behaviour -- relation: the schema's tags against the README table */
  it("accepts exactly the tags the blog README's Tags table documents", () => {
    const documented = [...README.matchAll(/^\| `([a-z-]+)` +\|/gm)].map(([, tag]) => tag);

    expect(BlogFrontmatter.shape.tags.element.options.toSorted()).toEqual(documented.toSorted());
  });
  /* oxlint-enable tests/observe-behaviour */
});
