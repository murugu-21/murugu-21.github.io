// Reads the API's inputs out of the deployed static build through the ASSETS
// binding — the same indirection grounding.ts uses. Nothing is cached in
// memory: the binding call is local to the isolate, and the API's own
// Cache-Control lets the edge do the caching, so a redeploy is visible
// immediately instead of being pinned by a stale module-level copy.

import {parseDataset, type Dataset} from "./dataset";
import {parsePostList, postMarkdownPath, type PostSummary} from "./posts";

export type AssetsLike = {fetch(input: string): Promise<Response>};

// The host is irrelevant for the assets binding — only the path is matched.
const ASSET_ORIGIN = "https://assets.local";

async function readText(
  assets: AssetsLike,
  path: string
): Promise<string | null> {
  try {
    const res = await assets.fetch(`${ASSET_ORIGIN}${path}`);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** null when the build artifact is absent or does not match the schema. */
export async function loadDataset(assets: AssetsLike): Promise<Dataset | null> {
  const body = await readText(assets, "/api/dataset.json");
  if (body === null) return null;
  try {
    return parseDataset(JSON.parse(body));
  } catch {
    return null;
  }
}

export async function loadPosts(assets: AssetsLike): Promise<PostSummary[]> {
  const body = await readText(assets, "/llms.txt");
  return body === null ? [] : parsePostList(body);
}

export async function loadPostMarkdown(
  assets: AssetsLike,
  slug: string
): Promise<string | null> {
  const path = postMarkdownPath(slug);
  return path === null ? null : readText(assets, path);
}
