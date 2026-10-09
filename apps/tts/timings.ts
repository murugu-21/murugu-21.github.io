// The timing JSON stored next to each post's MP3 in R2 (@murugappan/contracts/audio-timings.ts).
// A full render writes version 1; align-audio.ts adds `words` as version 2, and a patch
// keeps whichever version it found.
import { z } from "zod";

import { AudioTimings, TimedBlock } from "@murugappan/contracts/audio-timings.ts";
import { jsonString } from "@murugappan/utils/json.ts";

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface Span {
  start: number;
  end: number;
}

// The page's schema made loose, so every field this code doesn't touch round-trips untouched.
export const StoredTimings = jsonString(
  z.looseObject({
    ...AudioTimings.shape,
    sampleRate: z.number(),
    blocks: z.array(z.looseObject(TimedBlock.shape))
  })
);
export type StoredTimings = z.infer<typeof StoredTimings>;
export type StoredBlock = StoredTimings["blocks"][number];

const StoredHash = jsonString(z.object({ hash: z.string() }));

// The spoken-text hash the stored audio was rendered from, if it recorded one.
export const storedHash = (json: string): string | null =>
  StoredHash.safeParse(json).data?.hash ?? null;

export function renderedTimings({
  slug,
  hash,
  voice,
  sampleRate,
  duration,
  texts,
  spans
}: {
  slug: string;
  hash: string;
  voice: string;
  sampleRate: number;
  duration: number;
  texts: string[];
  spans: Span[];
}) {
  if (spans.length !== texts.length) throw new Error("block/timing count mismatch");
  return {
    version: 1,
    slug,
    hash,
    voice,
    sampleRate,
    duration: round3(duration),
    blocks: texts.map((text, i) => ({
      text,
      start: round3(spans[i].start),
      end: round3(spans[i].end)
    }))
  } satisfies StoredTimings;
}

// The blocks whose text changed, which a patch re-synthesizes. A patch needs
// the stored paragraph count, since every block keeps its slot in the MP3.
export function changedBlocks({
  slug,
  stored,
  texts
}: {
  slug: string;
  stored: StoredTimings;
  texts: string[];
}): number[] {
  if (stored.blocks.length !== texts.length) {
    throw new Error(
      `block count changed (${stored.blocks.length} → ${texts.length}); run \`bun run audio ${slug} --force\``
    );
  }
  return texts.flatMap((text, i) => (stored.blocks[i].text === text ? [] : [i]));
}

// `duration` is already rounded. Patched blocks lose their words until
// `bun run audio:align` re-times them; the others keep theirs, moved with the block.
export function patchedTimings({
  stored,
  texts,
  hash,
  duration,
  spans,
  patched
}: {
  stored: StoredTimings;
  texts: string[];
  hash: string;
  duration: number;
  spans: Span[];
  patched: ReadonlySet<number>;
}): StoredTimings {
  return {
    ...stored,
    hash,
    duration,
    blocks: stored.blocks.map((block, i) => {
      const start = round3(spans[i].start);
      const end = round3(spans[i].end);
      const { words, ...rest } = block;
      if (patched.has(i)) return { ...rest, text: texts[i], start, end };
      const shift = start - block.start;
      const moved = words?.map(w => ({ ...w, s: round3(w.s + shift), e: round3(w.e + shift) }));
      return { ...rest, start, end, words: moved };
    })
  };
}
