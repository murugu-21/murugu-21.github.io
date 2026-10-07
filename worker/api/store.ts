// Reads build artifacts through the ASSETS binding for the REST API, MCP and chat grounding.
// No in-memory cache: the binding is isolate-local and the edge caches, so redeploys show at once.

import { parseDataset, type Dataset } from "#contracts/api/dataset.ts";
import { parsePostList, postMarkdownPath, type PostSummary } from "#contracts/api/posts.ts";

export type AssetsLike = { fetch(input: string): Promise<Response> };

// The assets binding matches only the path.
const ASSET_ORIGIN = "https://assets.local";

/** The asset's text, or null when it is absent, non-2xx or the binding throws. */
export async function readAsset(assets: AssetsLike, path: string): Promise<string | null> {
  try {
    const res = await assets.fetch(`${ASSET_ORIGIN}${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** null when the build artifact is absent or does not match the schema. */
export async function loadDataset(assets: AssetsLike): Promise<Dataset | null> {
  const body = await readAsset(assets, "/api/dataset.json");
  if (body === null) return null;
  try {
    return parseDataset(JSON.parse(body));
  } catch {
    return null;
  }
}

export async function loadPosts(assets: AssetsLike): Promise<PostSummary[]> {
  const body = await readAsset(assets, "/llms.txt");
  return body === null ? [] : parsePostList(body);
}

/** A published post with its markdown, so an unlisted markdown file can't be guessed. */
export async function loadPost(
  assets: AssetsLike,
  slug: string
): Promise<(PostSummary & { markdown: string }) | null> {
  const path = postMarkdownPath(slug);
  if (path === null) return null;
  const post = (await loadPosts(assets)).find(p => p.slug === slug);
  if (!post) return null;
  const markdown = await readAsset(assets, path);
  return markdown === null ? null : { ...post, markdown };
}
