// The spoken text of a post. The audio generator (apps/tts) and the page's
// player both derive it here, so block texts match the timing JSON. DOM access
// is typed structurally so tests can use plain objects on Node (no DOM).

interface BlockLike<C> {
  tagName: string;
  textContent: string | null;
  children: ArrayLike<C>;
}

interface SpeechBlock<T> {
  el: T;
  text: string;
}

// Code, mermaid source and tables are noise when read aloud.
const SKIPPED_TAGS = new Set(["PRE", "FIGURE", "TABLE", "HR", "SCRIPT", "STYLE"]);
// Read lists item by item so the highlight and resume point stay fine-grained.
const SPLIT_TAGS = new Set(["UL", "OL"]);

const clean = (text: string | null) => (text ?? "").replaceAll(/\s+/g, " ").trim();

export function speechBlocks<T extends BlockLike<T>>(root: BlockLike<T>): SpeechBlock<T>[] {
  const out: SpeechBlock<T>[] = [];
  const visit = (el: T) => {
    const tag = el.tagName.toUpperCase();
    if (SKIPPED_TAGS.has(tag)) return;
    if (SPLIT_TAGS.has(tag)) {
      Array.from(el.children).forEach(visit);
      return;
    }
    const text = clean(el.textContent);
    if (text) out.push({ el, text });
  };
  Array.from(root.children).forEach(visit);
  return out;
}

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

// Whitespace-delimited tokens of a normalised block text; punctuation stays
// attached to its word so tokens map 1:1 onto rendered text.
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(t => t.length > 0);
}
