// The generator's side of synth.py, plus how a post's text becomes the chunks
// it renders.
import { parseHTML } from "linkedom";
import { z } from "zod";

import { normalizeSpeechText, speechBlocks } from "@murugappan/content/speech.ts";
import { packSentences } from "./audio-prep.ts";
import type { JsonLines } from "./json-lines.ts";

const CHUNK_MAX = 300;

export interface Chunk {
  id: string;
  text: string;
}

// The spoken blocks of a built post page: its title, then the body.
export function postBlocks({ slug, html }: { slug: string; html: string }): string[] {
  const { document } = parseHTML(html);
  const title = document.querySelector("[data-post-title]");
  const body = document.querySelector("[data-post-body]");
  if (!body) throw new Error(`${slug}: no post body section`);
  const raw = speechBlocks(body).map(b => b.text);
  if (title) raw.unshift(title.textContent ?? "");
  return raw.map(normalizeSpeechText).filter(t => t.length > 0);
}

export const chunkBlock = (text: string, b: number): Chunk[] =>
  packSentences(text, CHUNK_MAX).map((chunkText, c) => ({
    id: `b${String(b).padStart(3, "0")}-c${String(c).padStart(2, "0")}`,
    text: chunkText
  }));

// synth.py replies: one after model load (with the rate every chunk is written at), one
// per chunk, `done` per job.
const ReadyMsg = z.object({ loadSeconds: z.number(), sampleRate: z.number().int().positive() });
const ChunkMsg = z.union([
  z.object({ id: z.string(), error: z.string() }),
  z.object({ id: z.string(), seconds: z.number(), wall: z.number() })
]);
const JobMsg = z.union([z.object({ done: z.literal(true) }), ChunkMsg]);

export function synthClient({ next, send, close }: JsonLines) {
  return {
    ready: next().then(msg => ReadyMsg.parse(msg)),
    // Logs each rendered chunk, and throws once the job ends if any failed.
    async runJob(jobPath: string): Promise<void> {
      send(jobPath);
      const errors: string[] = [];
      for (;;) {
        const msg = JobMsg.parse(await next());
        if ("done" in msg) break;
        if ("error" in msg) errors.push(`${msg.id}: ${msg.error}`);
        else console.log(`  ${msg.id} ${msg.seconds.toFixed(1)}s audio in ${msg.wall}s`);
      }
      if (errors.length) {
        throw new Error(`synthesis failed for ${errors.length} chunk(s):\n${errors.join("\n")}`);
      }
    },
    [Symbol.asyncDispose]: close
  };
}

export type SynthClient = ReturnType<typeof synthClient>;
