import { createHash } from "node:crypto";

const SENTENCE_END = /(?<=[.!?])\s+/;

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

export function spokenHash(texts: string[]): string {
  return createHash("sha256").update(texts.join("\n")).digest("hex");
}
