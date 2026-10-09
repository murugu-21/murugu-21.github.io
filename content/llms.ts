// The text served to agents: /llms.txt, /blog/llms.txt, /blog/llms-full.txt and the markdown
// renditions of the homepage and blog index. The preamble is a ?raw .txt because it contains
// backticks.
import LLMS_PREAMBLE from "./llms-preamble.txt?raw";
import { newestFirst, oneLineDescription, postUrl, type PostSource } from "./posts.ts";
import { AUTHOR, BLOG_DESCRIPTION, BLOG_TITLE } from "./site.ts";

// Newest-first "- [title](url): description" lines, shared by /llms.txt, /blog/llms.txt and
// /blog/index.md so they can't drift.
const postLines = (posts: PostSource[]): string[] =>
  newestFirst(posts).map(post => {
    const link = `[${post.data.title}](${postUrl(post.slug)})`;
    const desc = oneLineDescription(post);
    return desc ? `- ${link}: ${desc}` : `- ${link}`;
  });

/** /llms.txt: the hand-written site summary plus every blog post. */
export const siteLlmsText = (posts: PostSource[]) =>
  `${LLMS_PREAMBLE.trimEnd()}\n\n## Blog posts\n${postLines(posts).join("\n")}\n`;

/** /blog/index.md: the blog's title and description over its post list. */
export const blogIndexMarkdown = (posts: PostSource[]) =>
  `# ${BLOG_TITLE}\n\n> ${BLOG_DESCRIPTION}\n\n## Posts\n${postLines(posts).join("\n")}\n`;

/** /blog/llms.txt (https://llmstxt.org): a map of the blog's posts. */
export const blogLlmsText = (posts: PostSource[]) =>
  [
    `# ${BLOG_TITLE}`,
    ``,
    `> ${BLOG_DESCRIPTION}, by ${AUTHOR.name}.`,
    ``,
    `## Posts`,
    ``,
    ...postLines(posts),
    ``
  ].join(`\n`);

/** /blog/llms-full.txt (https://llmstxt.org): every post's markdown body in one file. */
export const blogLlmsFullText = (posts: PostSource[]) =>
  [
    `# ${BLOG_TITLE}: full content`,
    ``,
    `> ${BLOG_DESCRIPTION}, by ${AUTHOR.name}.`,
    ...newestFirst(posts).flatMap(post => [
      ``,
      `---`,
      ``,
      `# ${post.data.title}`,
      `URL: ${postUrl(post.slug)}`,
      `Date: ${post.data.date.toISOString().slice(0, 10)}`,
      `Description: ${oneLineDescription(post)}`,
      ``,
      post.body.trim()
    ]),
    ``
  ].join(`\n`);
