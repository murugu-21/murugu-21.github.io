// align-audio.ts's side of whisper.py, and what each reply does to a block.
import { z } from "zod";

import { alignWords } from "#src/lib/blog/audio-words.ts";
import type { JsonLines } from "./json-lines.ts";
import type { StoredBlock } from "./timings.ts";

const WhisperReply = z.object({
  error: z.string().optional(),
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional()
});
type WhisperReply = z.infer<typeof WhisperReply>;

export function whisperClient({ next, send, close }: JsonLines) {
  return {
    async transcribe(job: { id: string; wav: string; text: string }): Promise<WhisperReply> {
      send(JSON.stringify(job));
      return WhisperReply.parse(await next());
    },
    [Symbol.asyncDispose]: close
  };
}

export type WhisperClient = ReturnType<typeof whisperClient>;

// A block whisper failed on, or matched poorly, keeps no `words` (paragraph
// highlight only), and `problem` says why.
export function alignBlock(
  block: StoredBlock,
  reply: WhisperReply
): { block: StoredBlock; problem?: string } {
  const { words: _drop, ...rest } = block;
  if (reply.error) return { block: rest, problem: `whisper failed: ${reply.error}` };
  const whisperWords = reply.words ?? [];
  const words = alignWords(block.text, whisperWords, block);
  if (!words) {
    return {
      block: rest,
      problem: `poor match (${whisperWords.length} whisper words), paragraph only`
    };
  }
  return { block: { ...rest, words } };
}
