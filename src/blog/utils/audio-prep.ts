// Pure text preparation shared by the audio generation script and the client.
// The client must normalise the same way so block texts match the timing JSON.

// Emoji, pictographs and their modifiers. Punctuation is kept.
const SYMBOLS = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{FE0F}\u{200D}]/gu;

// A run of five or more of one digit in the fractional part of a decimal
// (0.30000000000000004). LLM-style TTS models loop on these, so the run is
// described instead of listed.
const LONG_DIGIT_RUN = /(\d+\.\d*?)((\d)\3{4,})(\d*)/g;
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

function describeDigitRun(
  _match: string,
  head: string,
  run: string,
  digit: string,
  tail: string
): string {
  const spoken = `${head}, then ${DIGIT_NAMES[Number(digit)]} repeated ${run.length} times`;
  return tail ? `${spoken}, then ${tail}` : spoken;
}

export function normalizeSpeechText(text: string): string {
  return text
    .replace(SYMBOLS, "")
    .replace(LONG_DIGIT_RUN, describeDigitRun)
    .replace(/([?!.])[?!.]+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Sentence boundary: terminal punctuation followed by whitespace.
const SENTENCE_END = /(?<=[.!?])\s+/;

// Greedily pack sentences into chunks of at most `max` characters. A single
// sentence longer than `max` is emitted on its own rather than split mid-way.
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

// SHA-256 of the spoken text; the generator stores it so unchanged posts are
// skipped. WebCrypto is available in Node 22 and in Workers alike.
export async function spokenHash(texts: string[]): Promise<string> {
  const data = new TextEncoder().encode(texts.join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
