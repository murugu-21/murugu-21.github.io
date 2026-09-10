// Pure helpers behind the "Listen" control on blog posts. The DOM walking is
// typed structurally (tagName / textContent / children) so it can be unit
// tested with plain objects in the workers pool, where there is no DOM.

export interface BlockLike {
  tagName: string;
  textContent: string | null;
  children: ArrayLike<BlockLike>;
}

export interface SpeechBlock<T extends BlockLike> {
  el: T;
  text: string;
}

// Hearing raw code, mermaid source or a flattened table read aloud is noise,
// so those blocks are dropped rather than announced.
const SKIPPED_TAGS = new Set(["PRE", "FIGURE", "TABLE", "HR", "SCRIPT", "STYLE"]);
// Lists are read item by item so the highlight and the resume point stay fine
// grained on long lists.
const SPLIT_TAGS = new Set(["UL", "OL"]);

const clean = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

export function speechBlocks<T extends BlockLike>(root: T): SpeechBlock<T>[] {
  const out: SpeechBlock<T>[] = [];
  const visit = (el: T) => {
    const tag = el.tagName.toUpperCase();
    if (SKIPPED_TAGS.has(tag)) return;
    if (SPLIT_TAGS.has(tag)) {
      Array.from(el.children as ArrayLike<T>).forEach(visit);
      return;
    }
    const text = clean(el.textContent);
    if (text) out.push({ el, text });
  };
  Array.from(root.children as ArrayLike<T>).forEach(visit);
  return out;
}

// SpeechSynthesisUtterance.rate accepts 0.1–10; these are the values the picker
// offers. 1 is the browser's normal speed.
export const SPEECH_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

export function parseRate(value: string | null): SpeechRate {
  const n = Number(value);
  return (SPEECH_RATES as readonly number[]).includes(n) ? (n as SpeechRate) : 1;
}
