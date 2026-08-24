// Blog posts for /api/posts come from the site's own llms.txt, the same file
// Jarvis is grounded on (see grounding.ts). merge-llms.mjs appends every post
// there at build time as "- [title](url): description", so there is exactly
// one build artifact listing posts and the API cannot fall behind the blog.

export type PostSummary = {
  slug: string;
  title: string;
  url: string;
  description: string;
};

const POST_LINE = /^- \[(.+?)\]\((https?:\/\/[^\s)]+)\)(?::\s*(.*))?$/;
// Post pages only: /blog/<slug>/ — this drops the feed links (rss.xml,
// llms-full.txt) and the blog index that share the "- [..](..)" shape.
const POST_PATH = /^\/blog\/([a-z0-9-]+)\/?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SECTION_HEADING = "## Blog posts";

// The list section is preferred; a whole-document scan is the fallback so a
// rename of the heading in merge-llms.mjs degrades to "still works" rather
// than to an empty /api/posts.
function candidateLines(llmsTxt: string): string[] {
  const lines = llmsTxt.split("\n");
  const start = lines.findIndex(l => l.trim() === SECTION_HEADING);
  if (start === -1) return lines;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(l => l.startsWith("## "));
  return end === -1 ? rest : rest.slice(0, end);
}

export function parsePostList(llmsTxt: string): PostSummary[] {
  const posts: PostSummary[] = [];
  for (const line of candidateLines(llmsTxt)) {
    const match = line.trim().match(POST_LINE);
    if (!match) continue;
    const [, title, url, description] = match;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    const slug = pathname.match(POST_PATH)?.[1];
    if (!slug) continue;
    posts.push({slug, title, url, description: description?.trim() ?? ""});
  }
  return posts;
}

// generate-markdown.mjs writes the post's markdown source next to its built
// index.html; the slug is re-validated here because it comes from the request
// path, not from the parsed list.
export function postMarkdownPath(slug: string): string | null {
  return SLUG.test(slug) ? `/blog/${slug}/index.md` : null;
}
