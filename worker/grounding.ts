// Grounds on root llms.txt (~900 tokens), which lists every post as title +
// summary + link. blog/llms-full.txt costs ~20x the tokens and grows per post.
import { readAsset, type AssetsLike } from "./api/store";

const CACHE_KEY = "grounding:v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cached = { text: string; fetchedAt: number };

type StorageLike = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};

export async function getGrounding(storage: StorageLike, assets: AssetsLike): Promise<string> {
  const cached = await storage.get<Cached>(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.text;

  const text = (await readAsset(assets, "/llms.txt")) ?? "";
  if (!text.trim()) return cached?.text ?? "";

  await storage.put(CACHE_KEY, {
    text,
    fetchedAt: Date.now()
  } satisfies Cached);
  return text;
}
