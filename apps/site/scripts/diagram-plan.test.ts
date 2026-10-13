import { ProtocolError } from "puppeteer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  diagramJobs,
  orphans,
  pendingRenders,
  retryRenders,
  variantLabel,
  type Job,
  type Render
} from "./diagram-plan.ts";

describe("diagramJobs", () => {
  it("makes a job per fence and expects a light SVG, a dark SVG and a PNG for each", async () => {
    const { jobs, expected } = await diagramJobs([
      {
        path: "/blog/a/index.md",
        markdown:
          "# A\n\n```mermaid\ngraph TD; A-->B\n```\n\nText.\n\n```mermaid\ngraph LR; C-->D\n```\n"
      },
      { path: "/blog/b/index.md", markdown: "# B\n\n```ts\nconst mermaid = 1;\n```\n" }
    ]);
    expect(jobs.map(({ post, index, source }) => ({ post, index, source }))).toEqual([
      { post: "/blog/a/index.md", index: 0, source: "graph TD; A-->B" },
      { post: "/blog/a/index.md", index: 1, source: "graph LR; C-->D" }
    ]);
    // Names each file by the fence whose hash it carries.
    const fenceOf = new Map(jobs.map(({ hash, index }) => [hash, `fence${index}`]));
    const byFence = (files = new Set<string>()) =>
      [...files].map(file => file.replace(/[0-9a-f]{12}/, hash => fenceOf.get(hash) ?? hash));
    expect([...expected.keys()]).toEqual(["/blog/a", "/blog/b"]);
    expect(byFence(expected.get("/blog/a"))).toEqual([
      "/blog/a/diagrams/fence0.light.svg",
      "/blog/a/diagrams/fence0.dark.svg",
      "/blog/a/diagrams/fence0.png",
      "/blog/a/diagrams/fence1.light.svg",
      "/blog/a/diagrams/fence1.dark.svg",
      "/blog/a/diagrams/fence1.png"
    ]);
    expect(byFence(expected.get("/blog/b"))).toEqual([]);
  });
});

describe("orphans", () => {
  it("lists rendered files no fence expects, in posts that have a diagrams folder", () => {
    const listing = new Map([["/blog/a/diagrams", ["aaa.light.svg", "old.light.svg", "old.png"]]]);
    expect(
      orphans({
        expected: new Map([
          ["/blog/a", new Set(["/blog/a/diagrams/aaa.light.svg"])],
          ["/blog/b", new Set<string>()]
        ]),
        listDir: dir => listing.get(dir) ?? []
      })
    ).toEqual(["/blog/a/diagrams/old.light.svg", "/blog/a/diagrams/old.png"]);
  });
});

describe("pendingRenders", () => {
  const job = (hash: string): Job => ({ post: "/blog/a/index.md", index: 0, source: "", hash });
  const jobs = [job("current"), job("darkstale"), job("lightstale"), job("nopng")];
  // Up to date: SVGs stamped by this mermaid. On disk: any file, stamped or not.
  const upToDate = new Set([
    "/blog/a/diagrams/current.light.svg",
    "/blog/a/diagrams/current.dark.svg",
    "/blog/a/diagrams/darkstale.light.svg",
    "/blog/a/diagrams/lightstale.dark.svg",
    "/blog/a/diagrams/nopng.light.svg",
    "/blog/a/diagrams/nopng.dark.svg"
  ]);
  const onDisk = new Set([
    ...upToDate,
    "/blog/a/diagrams/current.png",
    "/blog/a/diagrams/darkstale.dark.svg",
    "/blog/a/diagrams/darkstale.png",
    "/blog/a/diagrams/lightstale.light.svg",
    "/blog/a/diagrams/lightstale.png"
  ]);
  const pending = (force: boolean) =>
    pendingRenders({
      jobs,
      force,
      isCurrent: path => upToDate.has(path),
      exists: path => onDisk.has(path)
    }).map(({ variant, path }) => `${variantLabel(variant)} ${path}`);

  it("renders stale or missing SVGs, and the PNG whenever its light SVG is stale or it is missing", () => {
    expect(pending(false)).toEqual([
      "dark /blog/a/diagrams/darkstale.dark.svg",
      "light /blog/a/diagrams/lightstale.light.svg",
      "png /blog/a/diagrams/lightstale.png",
      "png /blog/a/diagrams/nopng.png"
    ]);
  });

  it("renders everything with --force", () => {
    expect(pending(true)).toHaveLength(12);
    expect(pending(true).slice(0, 3)).toEqual([
      "light /blog/a/diagrams/current.light.svg",
      "dark /blog/a/diagrams/current.dark.svg",
      "png /blog/a/diagrams/current.png"
    ]);
  });
});

describe("retryRenders", () => {
  const job: Job = { post: "/blog/a/index.md", index: 0, source: "graph TD; A-->B", hash: "aaa" };
  const renders: Render[] = ["a", "b", "c"].map(path => ({ job, variant: { kind: "png" }, path }));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("retries a timed-out browser with only the renders it has not written yet", async () => {
    const warnings: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args));
    const batches: string[][] = [];
    await retryRenders({
      renders,
      attempts: 3,
      run: async batch => {
        batches.push(batch.renders.map(({ path }) => path));
        if (batches.length > 1) return;
        batch.written.add("a");
        throw new ProtocolError("Page.captureScreenshot timed out.");
      }
    });
    expect(batches).toEqual([
      ["a", "b", "c"],
      ["b", "c"]
    ]);
  });

  it("fails at once on a non-browser error, and after the last attempt on a browser one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let calls = 0;
    const failWith = (error: Error) => async () => {
      calls++;
      throw error;
    };
    await expect(
      retryRenders({ renders, attempts: 3, run: failWith(new Error("Parse error on line 2")) })
    ).rejects.toThrow("Parse error on line 2");
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      retryRenders({ renders, attempts: 3, run: failWith(new ProtocolError("timed out")) })
    ).rejects.toThrow("timed out");
    expect(calls).toBe(3);
  });
});
