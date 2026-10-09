// The blog's schema.org nodes, for the @graph Layout writes on each blog page.
import type { Blog, BlogPosting } from "schema-dts";
import { BLOG_DESCRIPTION, BLOG_TITLE } from "#content/site.ts";
import { BLOG_ID, BLOG_URL, PERSON_ID, WEBSITE_ID } from "#src/lib/site.ts";
import { postDescription, postUrl, type PostSource } from "#content/posts.ts";
import { postKeywords } from "./posts";

export const blog: Blog = {
  "@type": "Blog",
  "@id": BLOG_ID,
  name: BLOG_TITLE,
  description: BLOG_DESCRIPTION,
  url: `${BLOG_URL}/`,
  isPartOf: { "@id": WEBSITE_ID },
  author: { "@id": PERSON_ID },
  publisher: { "@id": PERSON_ID }
};

export function blogPosting(post: PostSource): BlogPosting {
  const url = postUrl(post.slug);
  return {
    "@type": "BlogPosting",
    headline: post.data.title,
    description: postDescription(post),
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: post.data.date.toISOString(),
    dateModified: post.data.date.toISOString(),
    keywords: postKeywords(post).join(", "),
    image: `${BLOG_URL}/og-image.png`,
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": BLOG_ID }
  };
}
