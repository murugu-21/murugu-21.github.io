import { spawn } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { text } from "node:stream/consumers";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIXTURE_PREFIX = "lint-fixture-";
const DIR = `${FIXTURE_PREFIX}${process.pid}`;

const Report = z.object({
  diagnostics: z.array(
    z.object({
      message: z.string(),
      help: z.string().nullish(),
      filename: z.string(),
      labels: z.tuple([z.object({ span: z.object({ line: z.number() }) })], z.unknown())
    })
  )
});
type Report = z.infer<typeof Report>;
type Diagnostic = { line: number; message: string; help?: string };
type Fixture = { file: string; code: string; diagnostics: Diagnostic[] };

const restrictedImport = ({
  specifier,
  help
}: {
  specifier: string;
  help: string;
}): Omit<Diagnostic, "line"> => ({
  message: `'${specifier}' import is restricted from being used by a pattern.`,
  help
});
const restrictedProperty = ({
  name,
  help
}: {
  name: string;
  help: string;
}): Omit<Diagnostic, "line"> => ({
  message: `'${name}' is restricted from being used.`,
  help
});
const restrictedGlobal = ({
  name,
  message
}: {
  name: string;
  message: string;
}): Omit<Diagnostic, "line"> => ({
  message: `Unexpected use of '${name}'. ${message}`,
  help: "Use a local variable or function parameter instead of the restricted global."
});

const PURE_MESSAGE =
  "A file with no role suffix holds pure functions and constants, so it imports no file that has one (type imports are fine). Give it the suffix of the role it plays, or move the call into that role (apps/api/README.md › Layers).";
const FETCH_MESSAGE =
  "Only a *.client.ts calls fetch. Put the call in a client and reach it through a repository or integration service (apps/api/README.md › Layers).";
const STORAGE_MESSAGE =
  "Storage throws where the browser blocks it. Go through readStored and writeStored in apps/site/src/lib/storage.ts, which catch that.";
const SHARED_MESSAGE =
  "Shared code can't import from a blog/ or home/ folder. Move the module to the shared folder, or the importer into that area (apps/site/src/README.md › Folders).";
const SHARED_IMPORTS = [
  "#src/components/blog/Tag.astro",
  "#src/data/blog/posts.ts",
  "#src/layouts/home/HomeLayout.astro",
  "#src/layouts/BlogLayout.astro",
  "#src/components/home/Blogs.astro"
];

const SYNC_MESSAGE =
  "blocks the event loop. Await node:fs/promises for files, run processes with spawnCollect or spawnInherit from @murugappan/utils/node/process.ts, and check a path with exists or read one that may be missing with ifPresent from @murugappan/utils/node/fs.ts.";

const NODE_TYPES = '/// <reference types="node" />\n';

const FIXTURES: Fixture[] = [
  {
    file: `tooling/${DIR}/sync.ts`,
    code: `${NODE_TYPES}import fs, { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const env = { useSync: (read: () => number) => read() };
export const text = readFileSync("a", "utf8");
export const ls = spawnSync("ls");
export const found = fs.existsSync("a");
export const kept = env.useSync(() => 1);
`,
    diagnostics: [
      { line: 5, message: `readFileSync ${SYNC_MESSAGE}` },
      { line: 6, message: `spawnSync ${SYNC_MESSAGE}` },
      { line: 7, message: `existsSync ${SYNC_MESSAGE}` }
    ]
  },
  {
    file: `tooling/${DIR}/argv.ts`,
    code: `${NODE_TYPES}export const target = process.argv[2];\n`,
    diagnostics: [
      {
        line: 2,
        ...restrictedProperty({
          name: "process.argv",
          help: "Read the command line with parseArgs from node:util, which takes process.argv by default and validates the options (Node.js › util.parseArgs)."
        })
      }
    ]
  },
  {
    file: `packages/utils/${DIR}/env.ts`,
    code: `${NODE_TYPES}export const key = process.env.KEY;\n`,
    diagnostics: [
      {
        line: 2,
        ...restrictedProperty({
          name: "process.env",
          help: "process.env is read in one place: apps/site/build-env.ts for the site build, and the bindings in apps/api/cloudflare.config.ts for the Worker. Declare the variable there (README.md › Build settings)."
        })
      }
    ]
  },
  {
    file: `apps/api/src/modules/${DIR}/helpers.ts`,
    code: `import { postsController } from "#src/modules/posts/posts.controller.ts";
export const mounted = [postsController];
export const assets = (c: { env: { ASSETS: string } }) => c.env.ASSETS;
export const probe = () => fetch("/");
export const probeGlobal = () => globalThis.fetch("/");
`,
    diagnostics: [
      {
        line: 1,
        ...restrictedImport({
          specifier: "#src/modules/posts/posts.controller.ts",
          help: PURE_MESSAGE
        })
      },
      {
        line: 3,
        ...restrictedProperty({
          name: "c.env",
          help: "Only *.client.ts files, and repositories through WorkerEnv, read bindings. Move the call there (apps/api/README.md › Layers)."
        })
      },
      { line: 4, ...restrictedGlobal({ name: "fetch", message: FETCH_MESSAGE }) },
      { line: 5, ...restrictedProperty({ name: "globalThis.fetch", help: FETCH_MESSAGE }) }
    ]
  },
  {
    file: `apps/api/src/modules/${DIR}/helpers.service.test.ts`,
    code: `import { NOT_FOUND_HTML } from "#test/fixtures.ts";
export const probe = () => fetch(NOT_FOUND_HTML);
`,
    diagnostics: []
  },
  {
    file: `apps/site/src/lib/${DIR}/store.ts`,
    code: `export const saved = localStorage.getItem("k");
export const session = sessionStorage.getItem("k");
export const viaWindow = window.localStorage.getItem("k");
export const viaGlobal = globalThis.sessionStorage.getItem("k");
`,
    diagnostics: [
      { line: 1, ...restrictedGlobal({ name: "localStorage", message: STORAGE_MESSAGE }) },
      { line: 2, ...restrictedGlobal({ name: "sessionStorage", message: STORAGE_MESSAGE }) },
      { line: 3, ...restrictedProperty({ name: "window.localStorage", help: STORAGE_MESSAGE }) },
      {
        line: 4,
        ...restrictedProperty({ name: "globalThis.sessionStorage", help: STORAGE_MESSAGE })
      }
    ]
  },
  {
    file: `apps/site/src/components/${DIR}/shared.ts`,
    code: `${SHARED_IMPORTS.map((specifier, i) => `import m${i} from "${specifier}";`).join("\n")}
export const all = [${SHARED_IMPORTS.map((_, i) => `m${i}`).join(", ")}];
`,
    diagnostics: SHARED_IMPORTS.map((specifier, i) => ({
      line: i + 1,
      ...restrictedImport({ specifier, help: SHARED_MESSAGE })
    }))
  },
  {
    file: `apps/site/src/components/blog/${DIR}/post.ts`,
    code: `import Blogs from "#src/components/home/Blogs.astro";
import { getPublishedPosts } from "#src/lib/blog/posts.ts";
export const all = [Blogs, getPublishedPosts];
`,
    diagnostics: [
      {
        line: 1,
        ...restrictedImport({
          specifier: "#src/components/home/Blogs.astro",
          help: "Blog code can't import homepage components. Move a component both use to the root of apps/site/src/components (apps/site/src/README.md › Folders)."
        })
      }
    ]
  },
  {
    file: `apps/site/src/components/home/${DIR}/hero.ts`,
    code: `import { getPublishedPosts } from "#src/lib/blog/posts.ts";
export const all = [getPublishedPosts];
`,
    diagnostics: []
  },
  {
    file: `apps/site/src/components/${DIR}/shared.test.ts`,
    code: `import Tag from "#src/components/blog/Tag.astro?raw";
export const all = [Tag];
`,
    diagnostics: []
  }
];
const FIXTURE_DIRS = [...new Set(FIXTURES.map(({ file }) => dirname(file)))];

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function removeStaleFixtures() {
  const parents = new Set(FIXTURE_DIRS.map(dir => dirname(dir)));
  for (const parent of parents) {
    for (const entry of await readdir(join(ROOT, parent))) {
      if (!entry.startsWith(FIXTURE_PREFIX) || entry === DIR) continue;
      if (isAlive(Number(entry.slice(FIXTURE_PREFIX.length)))) continue;
      await rm(join(ROOT, parent, entry), { recursive: true, force: true });
    }
  }
}

/* oxlint-disable tests/observe-behaviour -- the subject is the config as oxlint applies it, so the test drives the CLI */
describe("each banned primitive, linted for real", () => {
  let report: Report = { diagnostics: [] };
  beforeAll(async () => {
    await removeStaleFixtures();
    try {
      for (const { file, code } of FIXTURES) {
        await mkdir(join(ROOT, dirname(file)), { recursive: true });
        await writeFile(join(ROOT, file), code);
      }
      const files = FIXTURES.map(({ file }) => file);
      const vp = spawn(join(ROOT, "node_modules/.bin/vp"), ["lint", "-f", "json", ...files], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "inherit"]
      });
      const json: unknown = JSON.parse(await text(vp.stdout));
      report = Report.parse(json);
    } finally {
      await Promise.all(
        FIXTURE_DIRS.map(dir => rm(join(ROOT, dir), { recursive: true, force: true }))
      );
    }
  }, 120_000);

  it.each(FIXTURES)("$file", ({ file, diagnostics }) => {
    const found = report.diagnostics
      .filter(diagnostic => diagnostic.filename === file)
      .map(({ message, help, labels }) => ({
        line: labels[0].span.line,
        message,
        help: help ?? undefined
      }))
      .sort((a, b) => a.line - b.line);
    expect(found).toEqual(diagnostics);
  });
});
/* oxlint-enable tests/observe-behaviour */
