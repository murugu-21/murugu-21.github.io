// Grounds on root llms.txt (~900 tokens), which lists every post with its
// title, summary and link. blog/llms-full.txt costs ~20x the tokens and grows per post.
import { z } from "zod";

import { readAsset, type AssetsLike } from "./api/store";

const CACHE_KEY = "grounding:v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CachedGrounding = z.object({ text: z.string(), fetchedAt: z.number() });
export type CachedGrounding = z.infer<typeof CachedGrounding>;

type StorageLike = {
  get(key: string): Promise<unknown>;
  put(key: string, value: CachedGrounding): Promise<void>;
};

export async function getGrounding(storage: StorageLike, assets: AssetsLike): Promise<string> {
  const cached = CachedGrounding.safeParse(await storage.get(CACHE_KEY)).data;
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.text;

  const text = (await readAsset(assets, "/llms.txt")) ?? "";
  if (!text.trim()) return cached?.text ?? "";

  await storage.put(CACHE_KEY, {
    text,
    fetchedAt: Date.now()
  } satisfies CachedGrounding);
  return text;
}
