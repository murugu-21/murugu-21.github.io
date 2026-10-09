// Word-level timing for the read-aloud highlight: maps DOM spans to the times
// apps/tts/align-words.ts stored in the timing JSON.

import type { TimedWord } from "@murugappan/contracts/audio-timings.ts";
import { normalizeSpeechText, tokenize } from "@murugappan/content/speech.ts";

const isText = (node: Node): node is Text => node.nodeType === 3;
const isElement = (node: Node): node is Element => node.nodeType === 1;

const WORD_ATTR = "data-w";
// Highlights the spoken word (data-current-word, set by listen-player.ts) over its
// block's wash. palette.test.ts checks that body ink stays AA through both washes.
const WORD_CLASS =
  "data-current-word:rounded-xs data-current-word:bg-amber/25 data-current-word:ring-2 data-current-word:ring-amber/25 dark:data-current-word:bg-box-dark/20 dark:data-current-word:ring-box-dark/20";

const textNodes = (node: Node): Text[] =>
  Array.from(node.childNodes).flatMap(child => {
    if (isText(child)) return [child];
    return isElement(child) ? textNodes(child) : [];
  });

// Wraps each word of `el` in <span data-w="<word index>">, grouped per word in document
// order. Words span text nodes, so "<a>SiteGPT</a>'s" is one word of two
// spans. Idempotent: existing spans are regrouped by word index.
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
  // The word being built; it continues into the next text node unless
  // whitespace ended it.
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

// Pairs rendered words with timed words by position, mirroring the
// generator's normalisation: a word that normalises to nothing is skipped, one
// that expands to several tokens claims that many timed words. One entry per
// timed word; null when the sequences disagree.
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

// The last word that has started by t, so the highlight holds across gaps.
// -1 before the first word.
export function wordAt(words: ReadonlyArray<TimedWord>, t: number): number {
  return words.findLastIndex(w => w.s <= t);
}
