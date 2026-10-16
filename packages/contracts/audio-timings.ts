import { z } from "zod";

export const TimedWord = z.object({ w: z.string(), s: z.number(), e: z.number() });
export type TimedWord = z.infer<typeof TimedWord>;

export const TimedBlock = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  words: z.array(TimedWord).optional()
});
export type TimedBlock = z.infer<typeof TimedBlock>;

export const AudioTimings = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  duration: z.number(),
  blocks: z.array(TimedBlock)
});
export type AudioTimings = z.infer<typeof AudioTimings>;
