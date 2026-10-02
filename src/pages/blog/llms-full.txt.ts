import { SITE_TITLE, SITE_DESCRIPTION, SITE_URL, AUTHOR } from "../../blog/consts";
import { getPublishedPosts, excerpt } from "../../blog/utils/posts";

// /llms-full.txt (https://llmstxt.org): every post's markdown body in one file.
export async function GET() {
  const posts = (await getPublishedPosts()).reverse(); // newest first
  const base = SITE_URL.replace(/\/$/, "");

  const lines = [
    `# ${SITE_TITLE} — full content`,
    ``,
    `> ${SITE_DESCRIPTION} — by ${AUTHOR.name}.`
  ];

  posts.forEach(post => {
    const title = post.data.title;
    const url = `${base}/${post.id}/`;
    const date = post.data.date.toISOString().slice(0, 10);
    const desc = (post.data.description || excerpt(post.body)).replace(/\s+/g, ` `).trim();
    lines.push(
      ``,
      `---`,
      ``,
      `# ${title}`,
      `URL: ${url}`,
      `Date: ${date}`,
      `Description: ${desc}`,
      ``,
      (post.body || ``).trim()
    );
  });
  lines.push(``);

  return new Response(lines.join(`\n`), {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
