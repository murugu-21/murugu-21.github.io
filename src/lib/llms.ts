// The site's text for language models, in the two shapes it is served: the
// /llms.txt map and the markdown renditions of the homepage, /about/ and the
// blog index that a zone Transform Rule serves for Accept: text/markdown
// (see public/_headers). Built from the same post list, so none can drift.
// The preamble is a .txt imported ?raw rather than a TS template literal — it
// contains backticks.
import LLMS_PREAMBLE from "../data/llms-preamble.txt?raw";
import { SITE_DESCRIPTION, SITE_TITLE } from "../blog/consts";
import { postLines } from "../blog/utils/llms";

/** /llms.txt: the hand-written site summary plus every blog post. */
export async function siteLlmsText(): Promise<string> {
  return `${LLMS_PREAMBLE.trimEnd()}\n\n## Blog posts\n${(await postLines()).join("\n")}\n`;
}

/** /blog/index.md: the blog's title and description over its post list. */
export async function blogIndexMarkdown(): Promise<string> {
  return `# ${SITE_TITLE}\n\n> ${SITE_DESCRIPTION}\n\n## Posts\n${(await postLines()).join("\n")}\n`;
}

export const textResponse = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const markdownResponse = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
