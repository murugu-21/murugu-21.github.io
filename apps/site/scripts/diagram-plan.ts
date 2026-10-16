import { dirname, join } from "node:path";
import { ProtocolError } from "puppeteer";

import {
  DIAGRAMS_DIR,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  type DiagramTheme
} from "#src/lib/blog/mermaid-diagrams.ts";

export interface Job {
  post: string;
  index: number;
  source: string;
  hash: string;
}

export type Variant = { kind: "svg"; theme: DiagramTheme } | { kind: "png" };
const LIGHT_SVG: Variant = { kind: "svg", theme: "light" };
const VARIANTS: readonly Variant[] = [LIGHT_SVG, { kind: "svg", theme: "dark" }, { kind: "png" }];

export interface Render {
  job: Job;
  variant: Variant;
  path: string;
}

const variantPath = (job: Job, variant: Variant) =>
  join(
    dirname(job.post),
    variant.kind === "png" ? diagramRaster(job.hash) : diagramFile(job.hash, variant.theme)
  );

export const variantLabel = (variant: Variant) => (variant.kind === "png" ? "png" : variant.theme);

export async function diagramJobs(
  posts: { path: string; markdown: string }[]
): Promise<{ jobs: Job[]; expected: Map<string, Set<string>> }> {
  const jobs: Job[] = [];
  const expected = new Map<string, Set<string>>();
  for (const { path: post, markdown } of posts) {
    const files = new Set<string>();
    for (const [index, fence] of findMermaidFences(markdown).entries()) {
      const job: Job = { post, index, source: fence.source, hash: await diagramHash(fence.source) };
      jobs.push(job);
      for (const variant of VARIANTS) files.add(variantPath(job, variant));
    }
    expected.set(dirname(post), files);
  }
  return { jobs, expected };
}

export function orphans({
  expected,
  listDir
}: {
  expected: Map<string, Set<string>>;
  listDir: (dir: string) => string[];
}): string[] {
  return [...expected].flatMap(([postDir, files]) => {
    const dir = join(postDir, DIAGRAMS_DIR);
    return listDir(dir)
      .map(name => join(dir, name))
      .filter(path => !files.has(path));
  });
}

export function pendingRenders({
  jobs,
  force,
  isCurrent,
  exists
}: {
  jobs: Job[];
  force: boolean;
  isCurrent: (path: string) => boolean;
  exists: (path: string) => boolean;
}): Render[] {
  return jobs.flatMap(job => {
    const lightStale = force || !isCurrent(variantPath(job, LIGHT_SVG));
    return VARIANTS.flatMap(variant => {
      const path = variantPath(job, variant);
      const pending =
        force || (variant.kind === "png" ? lightStale || !exists(path) : !isCurrent(path));
      return pending ? [{ job, variant, path }] : [];
    });
  });
}

export async function retryRenders({
  renders,
  attempts,
  run
}: {
  renders: Render[];
  attempts: number;
  run: (batch: { renders: Render[]; written: Set<string> }) => Promise<void>;
}): Promise<void> {
  const written = new Set<string>();
  for (let attempt = 1; ; attempt++) {
    try {
      await run({ renders: renders.filter(({ path }) => !written.has(path)), written });
      return;
    } catch (cause) {
      if (attempt >= attempts || !(cause instanceof ProtocolError)) throw cause;
      console.warn(
        `render-mermaid: ${cause.message.split("\n")[0]} Retrying in a fresh browser ` +
          `(attempt ${attempt + 1} of ${attempts}).`
      );
    }
  }
}
