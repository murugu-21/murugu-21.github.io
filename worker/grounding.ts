// v2: root llms.txt only (~3.5KB ≈ 900 tokens). It already carries every blog
// post as title + summary + link (src/pages/llms.txt.ts generates them at
// build time); grounding on blog/llms-full.txt (~70KB) cost ~20x the input
// tokens per message and would eventually outgrow qwen3-30b's 32k context as
// posts accumulate. Jarvis answers post questions from summaries and points
// visitors at links.
const CACHE_KEY = "grounding:v2";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type Cached = {text: string; fetchedAt: number};

type StorageLike = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
};

type AssetsLike = {fetch(input: string): Promise<Response>};

async function fetchText(assets: AssetsLike, path: string): Promise<string> {
  try {
    // Host is irrelevant for the assets binding; only the path is matched.
    const res = await assets.fetch(`https://assets.local${path}`);
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

export async function getGrounding(
  storage: StorageLike,
  assets: AssetsLike
): Promise<string> {
  const cached = await storage.get<Cached>(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS)
    return cached.text;

  const text = await fetchText(assets, "/llms.txt");
  if (!text.trim()) return cached?.text ?? "";

  await storage.put(CACHE_KEY, {text, fetchedAt: Date.now()} satisfies Cached);
  return text;
}
