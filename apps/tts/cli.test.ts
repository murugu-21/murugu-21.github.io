import { mkdir, mkdtempDisposable, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { audioArgs, publishedSlugs, run, runEach } from "./cli.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("arguments", () => {
  it("parses `bun run audio` slugs and flags, and rejects an unknown flag", () => {
    expect(audioArgs(["react", "--patch", "--local"])).toEqual({
      force: false,
      local: true,
      "dry-run": false,
      patch: true,
      "upload-voice": false,
      slugs: ["react"]
    });
    expect(() => audioArgs(["--frce"])).toThrow("Unknown option '--frce'");
  });
});

describe("publishedSlugs", () => {
  it("lists only the built dirs whose page has a post body", async () => {
    await using dir = await mkdtempDisposable(join(tmpdir(), "blog-dist-"));
    await mkdir(join(dir.path, "first-post"));
    await writeFile(
      join(dir.path, "first-post", "index.html"),
      "<section data-post-body><p>Hi</p>"
    );
    await mkdir(join(dir.path, "404"));
    await writeFile(join(dir.path, "404", "index.html"), "<main>Not found</main>");
    await mkdir(join(dir.path, "drafts"));
    await writeFile(join(dir.path, "rss.xml"), "<rss />");
    expect(await publishedSlugs(dir.path)).toEqual(["first-post"]);
    await expect(publishedSlugs(join(dir.path, "missing"))).rejects.toThrow(
      "run `bun run build` first"
    );
  });
});

describe("runEach", () => {
  it("logs a failed slug, carries on with the rest and returns the failures", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const seen: string[] = [];
    const failures = await runEach(["react", "toolbox", "gastby"], async slug => {
      seen.push(slug);
      if (slug === "toolbox") throw new Error("timings in R2 but no MP3");
    });
    expect(failures).toEqual(["toolbox"]);
    expect(seen).toEqual(["react", "toolbox", "gastby"]);
    expect(log.mock.calls[0]).toEqual(["toolbox FAILED: timings in R2 but no MP3"]);
    expect(log.mock.calls[1][0]).toMatch(/^done in \d+\.\d min, failed: toolbox$/);
  });
});

describe("run", () => {
  it("returns a command's stdout, and throws its stderr when it fails", async () => {
    expect(await run(process.execPath, ["-e", "process.stdout.write('ok')"])).toBe("ok");
    await expect(
      run(process.execPath, ["-e", "process.stderr.write('no such file'); process.exit(2)"])
    ).rejects.toThrow("no such file");
  });
});
