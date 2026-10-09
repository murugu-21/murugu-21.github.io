// The timing JSON stored next to each post's MP3 (audio.ts): the fields the page's player reads.
// apps/site/scripts/generate-audio.ts writes it and align-audio.ts adds the words.
import { z } from "zod";

export const TimedWord = z.object({ w: z.string(), s: z.number(), e: z.number() });
export type TimedWord = z.infer<typeof TimedWord>;

export const TimedBlock = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  // Version 2 only, and only for blocks the alignment pass matched well.
  words: z.array(TimedWord).optional()
});
export type TimedBlock = z.infer<typeof TimedBlock>;

export const AudioTimings = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  duration: z.number(),
  blocks: z.array(TimedBlock)
});
export type AudioTimings = z.infer<typeof AudioTimings>;
