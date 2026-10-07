// Which files render-mermaid.ts should write and which it should prune: per
// fence a light and a dark SVG, plus a light PNG for RSS.
import { dirname, join } from "node:path";

import {
  DIAGRAMS_DIR,
  diagramFile,
  diagramHash,
  diagramRaster,
  findMermaidFences,
  type DiagramTheme
} from "#src/lib/blog/mermaid-diagrams.ts";

export interface Job {
  post: string; // path of index.md
  index: number;
  source: string;
  hash: string;
}

// The PNG can't carry the stamp; it is current exactly when the light SVG is.
export type Variant = { kind: "svg"; theme: DiagramTheme } | { kind: "png" };
const LIGHT_SVG: Variant = { kind: "svg", theme: "light" };
const VARIANTS: readonly Variant[] = [LIGHT_SVG, { kind: "svg", theme: "dark" }, { kind: "png" }];

const variantPath = (job: Job, variant: Variant) =>
  join(
    dirname(job.post),
    variant.kind === "png" ? diagramRaster(job.hash) : diagramFile(job.hash, variant.theme)
  );

export const variantLabel = (variant: Variant) => (variant.kind === "png" ? "png" : variant.theme);

// The expected files are keyed by post directory.
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

// `listDir` returns a directory's file names, or none when it doesn't exist.
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

// `isCurrent` says whether an SVG exists and carries the current stamp.
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
}): { job: Job; variant: Variant; path: string }[] {
  return jobs.flatMap(job => {
    const lightStale = force || !isCurrent(variantPath(job, LIGHT_SVG));
    return VARIANTS.map(variant => ({ job, variant, path: variantPath(job, variant) })).filter(
      ({ variant, path }) =>
        force || (variant.kind === "png" ? lightStale || !exists(path) : !isCurrent(path))
    );
  });
}
