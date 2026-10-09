// Text prep only the generator needs. The text itself comes normalised from
// @murugappan/content/speech.ts, shared with the page's player.
import { createHash } from "node:crypto";

// Sentence boundary: terminal punctuation followed by whitespace.
const SENTENCE_END = /(?<=[.!?])\s+/;

// Greedily packs sentences into chunks of at most `max` chars; a longer
// sentence is emitted whole.
export function packSentences(text: string, max = 300): string[] {
  const sentences = text.split(SENTENCE_END).filter(s => s.length > 0);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= max) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// The generator stores this to skip unchanged posts.
export function spokenHash(texts: string[]): string {
  return createHash("sha256").update(texts.join("\n")).digest("hex");
}
