// Pure helpers behind the blog "Listen" control. DOM access is typed
// structurally so tests can use plain objects in the Workers pool (no DOM).

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

// Rates the picker offers (SpeechSynthesisUtterance.rate accepts 0.1 to 10).
export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

export function parseRate(value: string | null): SpeechRate {
  return SPEECH_RATES.find(rate => rate === Number(value)) ?? 1;
}
