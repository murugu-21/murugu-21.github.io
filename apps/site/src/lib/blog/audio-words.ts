import type { TimedWord } from "@murugappan/contracts/audio-timings.ts";
import { normalizeSpeechText, tokenize } from "@murugappan/content/speech.ts";

const isText = (node: Node): node is Text => node.nodeType === 3;
const isElement = (node: Node): node is Element => node.nodeType === 1;

const WORD_ATTR = "data-w";
const WORD_CLASS =
  "data-current-word:rounded-xs data-current-word:bg-amber/25 data-current-word:ring-2 data-current-word:ring-amber/25 dark:data-current-word:bg-box-dark/20 dark:data-current-word:ring-box-dark/20";

const textNodes = (node: Node): Text[] =>
  Array.from(node.childNodes).flatMap(child => {
    if (isText(child)) return [child];
    return isElement(child) ? textNodes(child) : [];
  });

export function wrapWords(el: Element): HTMLElement[][] {
  const existing = Array.from(el.querySelectorAll<HTMLElement>(`span[${WORD_ATTR}]`));
  if (existing.length > 0) {
    const grouped: HTMLElement[][] = [];
    for (const span of existing) {
      const idx = Number(span.getAttribute(WORD_ATTR));
      (grouped[idx] ??= []).push(span);
    }
    return grouped.filter(Boolean);
  }

  const doc = el.ownerDocument;
  const words: HTMLElement[][] = [];
  let word: HTMLElement[] | null = null;
  for (const node of textNodes(el)) {
    const frag = doc.createDocumentFragment();
    for (const run of node.data.match(/\s+|\S+/g) ?? []) {
      if (/^\s/.test(run)) {
        frag.append(doc.createTextNode(run));
        word = null;
        continue;
      }
      if (!word) {
        word = [];
        words.push(word);
      }
      const span = doc.createElement("span");
      span.setAttribute(WORD_ATTR, String(words.length - 1));
      span.className = WORD_CLASS;
      span.textContent = run;
      word.push(span);
      frag.append(span);
    }
    node.replaceWith(frag);
  }
  return words;
}

const wordText = (pieces: ReadonlyArray<HTMLElement>) =>
  normalizeSpeechText(pieces.map(p => p.textContent ?? "").join(""));

export function matchWordSpans(
  words: ReadonlyArray<ReadonlyArray<HTMLElement>>,
  timed: ReadonlyArray<TimedWord>
): HTMLElement[][] | null {
  const out: HTMLElement[][] = [];
  let k = 0;
  for (const word of words) {
    const tokens = tokenize(wordText(word));
    for (const token of tokens) {
      if (k >= timed.length || timed[k].w !== token) return null;
      out.push([...word]);
      k++;
    }
  }
  return k === timed.length ? out : null;
}

export function wordAt(words: ReadonlyArray<TimedWord>, t: number): number {
  return words.findLastIndex(w => w.s <= t);
}
