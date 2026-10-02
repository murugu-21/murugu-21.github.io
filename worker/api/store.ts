// Reads build artifacts through the ASSETS binding for the REST API, MCP and chat grounding.
// No in-memory cache: the binding is isolate-local and the edge caches, so redeploys show at once.

import { parseDataset, type Dataset } from "./dataset";
import { parsePostList, postMarkdownPath, type PostSummary } from "./posts";

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

export async function loadPostMarkdown(assets: AssetsLike, slug: string): Promise<string | null> {
  const path = postMarkdownPath(slug);
  return path === null ? null : readAsset(assets, path);
}
