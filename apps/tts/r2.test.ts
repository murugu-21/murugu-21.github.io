import { mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vite-plus/test";

import { audioKey, r2Store } from "./r2.ts";

describe("r2Store", () => {
  // Each cf call starts miniflare, about a second apiece.
  it(
    "gets back what it put, null for an absent key, and throws on other failures",
    { timeout: 60_000 },
    async () => {
      await using dir = await mkdtempDisposable(join(tmpdir(), "r2-store-"));
      const r2 = r2Store({ persistTo: dir.path });
      const key = audioKey("some-slug", "json");
      expect(await r2.get(key)).toBeNull();

      const file = join(dir.path, "timings.json");
      await writeFile(file, '{"blocks":[]}');
      await r2.put({ key, file, contentType: "application/json" });
      expect((await r2.get("blog/breeze/some-slug.json"))?.toString()).toBe('{"blocks":[]}');

      await expect(r2Store({ persistTo: file }).get(key)).rejects.toThrow("cf r2 objects get");
    }
  );

  it("refuses a remote run while cf is logged out", { timeout: 30_000 }, async () => {
    await using home = await mkdtempDisposable(join(tmpdir(), "r2-home-"));
    vi.stubEnv("HOME", home.path);
    vi.stubEnv("XDG_CONFIG_HOME", home.path);
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });
    await expect(r2Store("remote").checkLogin()).rejects.toThrow("cf is not logged in");
  });
});
