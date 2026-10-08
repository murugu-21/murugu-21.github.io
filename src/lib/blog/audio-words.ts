// Word-level timing for the read-aloud highlight: alignWords runs in the
// alignment script, the rest maps DOM spans to those times in the client.

import { normalizeSpeechText } from "./audio-prep.ts";
import type { TimedWord } from "./audio-sync.ts";

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

// Whitespace-delimited tokens of a normalised block text; punctuation stays
// attached to its word so tokens map 1:1 onto rendered text.
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(t => t.length > 0);
}

// Matching key: lowercase letters and digits only, so "Don't" ≈ "don't" ≈
// "dont" and "fine." ≈ "fine".
const key = (token: string) => token.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");

// Longest common subsequence over match keys, as pairs of [textIndex, whisperIndex].
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

const MIN_MATCH_RATIO = 0.6;

// Times every token of `text` from whisper's words: matched tokens take
// whisper's times, unmatched runs are spread evenly between their neighbours.
// Absolute, clamped to the block and monotonic. Null below MIN_MATCH_RATIO,
// so the caller keeps the paragraph highlight.
export function alignWords(
  text: string,
  whisper: WhisperWord[],
  block: { start: number; end: number }
): TimedWord[] | null {
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;
  const pairs = lcsPairs(
    tokens.map(key),
    whisper.map(w => key(w.word))
  );
  if (pairs.length / tokens.length < MIN_MATCH_RATIO) return null;

  const length = block.end - block.start;
  const clamp = (t: number) => Math.min(length, Math.max(0, t));
  const anchors = new Map<number, { s: number; e: number }>();
  for (const [ti, wi] of pairs) {
    anchors.set(ti, { s: clamp(whisper[wi].start), e: clamp(whisper[wi].end) });
  }

  const out: TimedWord[] = Array.from({ length: tokens.length });
  let i = 0;
  while (i < tokens.length) {
    const anchor = anchors.get(i);
    if (anchor) {
      out[i] = { w: tokens[i], s: anchor.s, e: anchor.e };
      i++;
      continue;
    }
    // A run of unmatched tokens [i, j): spread between the previous anchor's
    // end (or 0) and the next anchor's start (or the block length).
    let j = i;
    while (j < tokens.length && !anchors.has(j)) j++;
    const from = i > 0 ? out[i - 1].e : 0;
    const to = anchors.get(j)?.s ?? length;
    const step = Math.max(0, to - from) / (j - i);
    for (let k = i; k < j; k++) {
      out[k] = {
        w: tokens[k],
        s: from + step * (k - i),
        e: from + step * (k - i + 1)
      };
    }
    i = j;
  }

  // Monotonic: no word may start before the previous one ends.
  for (let k = 1; k < out.length; k++) {
    if (out[k].s < out[k - 1].e) out[k].s = out[k - 1].e;
    if (out[k].e < out[k].s) out[k].e = out[k].s;
  }
  const round = (t: number) => Math.round((t + block.start) * 1000) / 1000;
  return out.map(w => ({ w: w.w, s: round(w.s), e: round(w.e) }));
}

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
