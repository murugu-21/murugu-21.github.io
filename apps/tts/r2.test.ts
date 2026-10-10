import { mkdtempDisposableSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { audioKey, r2Store } from "./r2.ts";

describe("r2Store", () => {
  // Each wrangler call starts miniflare, about a second apiece.
  it(
    "gets back what it put, null for an absent key, and throws on other failures",
    { timeout: 60_000 },
    () => {
      using dir = mkdtempDisposableSync(join(tmpdir(), "r2-store-"));
      const r2 = r2Store({ persistTo: dir.path });
      const key = audioKey("some-slug", "json");
      expect(r2.get(key)).toBeNull();

      const file = join(dir.path, "timings.json");
      writeFileSync(file, '{"blocks":[]}');
      r2.put({ key, file, contentType: "application/json" });
      expect(r2.get("blog/breeze/some-slug.json")?.toString()).toBe('{"blocks":[]}');

      // A persist dir that is a file fails for a reason other than absence.
      expect(() => r2Store({ persistTo: file }).get(key)).toThrow("wrangler r2 object get");
    }
  );
});
