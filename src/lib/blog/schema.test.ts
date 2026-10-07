import { describe, expect, it, vi } from "vitest";

import { blogPosting } from "./schema";
import { blogPost } from "./fixtures";

vi.mock("astro:content", async () => (await import("./fixtures")).astroContentMock);

describe("blogPosting", () => {
  it("describes a post for the blog's graph", () => {
    const post = blogPost({
      id: "rate-limiting",
      title: "Rate limiting",
      date: "2024-03-04",
      description: "Why and how",
      tags: ["backend"],
      keywords: ["token bucket"]
    });

    expect(blogPosting(post)).toEqual({
      "@type": "BlogPosting",
      headline: "Rate limiting",
      description: "Why and how",
      url: "https://murugappan.dev/blog/rate-limiting/",
      mainEntityOfPage: { "@type": "WebPage", "@id": "https://murugappan.dev/blog/rate-limiting/" },
      datePublished: "2024-03-04T00:00:00.000Z",
      dateModified: "2024-03-04T00:00:00.000Z",
      keywords: "backend, token bucket",
      image: "https://murugappan.dev/blog/og-image.png",
      author: { "@id": "https://murugappan.dev/#person" },
      publisher: { "@id": "https://murugappan.dev/#person" },
      isPartOf: { "@id": "https://murugappan.dev/blog/#blog" }
    });
  });
});
