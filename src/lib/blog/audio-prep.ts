// Text prep shared by the audio generator and the client, which must normalise
// identically so block texts match the timing JSON.

import { sha256Hex } from "#src/lib/hash.ts";

// Emoji, pictographs and their modifiers. Punctuation is kept.
const SYMBOLS = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{FE0F}\u{200D}]/gu;

// Five or more of one fractional digit (0.30000000000000004): LLM-style TTS
// models loop on these, so the run is described instead.
const LONG_DIGIT_RUN = /(\d+\.\d*?)((\d)\3{4,})\d*/g;
const DIGIT_NAMES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine"
];

function describeDigitRun(match: string, head: string, run: string): string {
  const tail = match.slice(head.length + run.length);
  const spoken = `${head}, then ${DIGIT_NAMES[Number(run[0])]} repeated ${run.length} times`;
  return tail ? `${spoken}, then ${tail}` : spoken;
}

export function normalizeSpeechText(text: string): string {
  return text
    .replace(SYMBOLS, "")
    .replace(LONG_DIGIT_RUN, describeDigitRun)
    .replaceAll(/([?!.])[?!.]+/g, "$1")
    .replaceAll(/\s+/g, " ")
    .trim();
}

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
export function spokenHash(texts: string[]): Promise<string> {
  return sha256Hex(texts.join("\n"));
}
