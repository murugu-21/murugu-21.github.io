// v2: root llms.txt only (~3.5KB ≈ 900 tokens). It already carries every blog
// post as title + summary + link (src/pages/llms.txt.ts generates them at
// build time); grounding on blog/llms-full.txt (~70KB) cost ~20x the input
// tokens per message and would keep growing with the post count. Jarvis
// answers post questions from summaries and points visitors at links.
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
