const CACHE_KEY = "grounding:v1";
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

  const [profile, posts] = await Promise.all([
    fetchText(assets, "/llms.txt"),
    fetchText(assets, "/blog/llms-full.txt")
  ]);
  const text = [profile, posts].filter(Boolean).join("\n\n");
  if (!text.trim()) return cached?.text ?? "";

  await storage.put(CACHE_KEY, {text, fetchedAt: Date.now()} satisfies Cached);
  return text;
}
