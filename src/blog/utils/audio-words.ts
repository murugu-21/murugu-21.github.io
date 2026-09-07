// Word-level timing for the read-aloud highlight. Shared by the alignment
// script (alignWords: whisper output → per-word times) and the client
// (wrapWords / matchWordSpans / wordAt: DOM spans ↔ those times).

import {normalizeSpeechText} from "./audio-prep.ts";

export interface TimedWord {
  w: string;
  s: number;
  e: number;
}

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
const key = (token: string) =>
  token.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

// Longest common subsequence over match keys → pairs of [textIndex, whisperIndex].
function lcsPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({length: n + 1}, () =>
    Array.from({length: m + 1}, () => 0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] && a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
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

// Assigns a time span to every token of `text` from whisper's word list for
// the same audio. Matched tokens take whisper's times; the rest are spread
// evenly across the gap between their matched neighbours (or the block
// edges). Times are returned absolute (offset by block.start), clamped into
// the block and monotonic. Null when fewer than 60% of tokens matched, in
// which case the caller keeps the paragraph-level highlight for that block.
export function alignWords(
  text: string,
  whisper: WhisperWord[],
  block: {start: number; end: number}
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
  const anchors = new Map<number, {s: number; e: number}>();
  for (const [ti, wi] of pairs) {
    anchors.set(ti, {s: clamp(whisper[wi].start), e: clamp(whisper[wi].end)});
  }

  const out: TimedWord[] = Array.from({length: tokens.length});
  let i = 0;
  while (i < tokens.length) {
    const anchor = anchors.get(i);
    if (anchor) {
      out[i] = {w: tokens[i], s: anchor.s, e: anchor.e};
      i++;
      continue;
    }
    // A run of unmatched tokens [i, j): spread between the previous anchor's
    // end (or 0) and the next anchor's start (or the block length).
    let j = i;
    while (j < tokens.length && !anchors.has(j)) j++;
    const from = i > 0 ? out[i - 1].e : 0;
    const to = j < tokens.length ? anchors.get(j)!.s : length;
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
  return out.map(w => ({w: w.w, s: round(w.s), e: round(w.e)}));
}

const WORD_CLASS = "rw";
const WORD_ATTR = "data-w";

// Wraps every whitespace-delimited word of `el`'s text in <span class="rw">
// elements and returns them grouped per word, in document order. Words are
// found over the block's full text, not per text node, so a word that
// straddles an inline element boundary ("<a>SiteGPT</a>’s", "<b>place</b>.")
// stays one word made of two spans. Idempotent: existing spans are regrouped
// by their word index.
export function wrapWords(el: HTMLElement): HTMLElement[][] {
  const existing = Array.from(
    el.querySelectorAll<HTMLElement>(`span.${WORD_CLASS}`)
  );
  if (existing.length > 0) {
    const grouped: HTMLElement[][] = [];
    for (const span of existing) {
      const idx = Number(span.getAttribute(WORD_ATTR));
      (grouped[idx] ??= []).push(span);
    }
    return grouped.filter(Boolean);
  }

  const doc = el.ownerDocument;
  const textNodes: Text[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) textNodes.push(child as Text);
      else if (child.nodeType === 1) walk(child);
    }
  };
  walk(el);

  // Word ranges over the concatenated text; text node offsets into it.
  const full = textNodes.map(n => n.data).join("");
  const ranges: Array<[number, number]> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(full))) ranges.push([m.index, m.index + m[0].length]);
  if (ranges.length === 0) return [];

  const words: HTMLElement[][] = ranges.map(() => []);
  let offset = 0;
  let r = 0;
  for (const node of textNodes) {
    const nodeStart = offset;
    const nodeEnd = offset + node.data.length;
    offset = nodeEnd;
    // Skip ranges that ended before this node.
    while (r < ranges.length && ranges[r][1] <= nodeStart) r++;
    if (r >= ranges.length || ranges[r][0] >= nodeEnd) continue;

    const frag = doc.createDocumentFragment();
    let cursor = nodeStart;
    let k = r;
    while (k < ranges.length && ranges[k][0] < nodeEnd) {
      const from = Math.max(ranges[k][0], nodeStart);
      const to = Math.min(ranges[k][1], nodeEnd);
      if (from > cursor) {
        frag.appendChild(doc.createTextNode(full.slice(cursor, from)));
      }
      const span = doc.createElement("span");
      span.className = WORD_CLASS;
      span.setAttribute(WORD_ATTR, String(k));
      span.textContent = full.slice(from, to);
      frag.appendChild(span);
      words[k].push(span);
      cursor = to;
      if (ranges[k][1] > nodeEnd) break; // word continues in the next node
      k++;
    }
    if (cursor < nodeEnd) {
      frag.appendChild(doc.createTextNode(full.slice(cursor, nodeEnd)));
    }
    node.parentNode?.replaceChild(frag, node);
  }
  return words;
}

const wordText = (pieces: ReadonlyArray<HTMLElement>) =>
  normalizeSpeechText(pieces.map(p => p.textContent ?? "").join(""));

// Pairs rendered words (as span groups) with timed words by position. Words
// whose text normalises to nothing (an emoji on its own) are skipped,
// mirroring how the generator's normalisation dropped them. Null when the
// sequences disagree, in which case the block keeps its paragraph highlight.
export function matchWordSpans(
  words: ReadonlyArray<ReadonlyArray<HTMLElement>>,
  timed: ReadonlyArray<TimedWord>
): HTMLElement[][] | null {
  const kept = words.filter(w => wordText(w).length > 0);
  if (kept.length !== timed.length) return null;
  for (let i = 0; i < kept.length; i++) {
    if (wordText(kept[i]) !== timed[i].w) return null;
  }
  return kept.map(w => [...w]);
}

// Index of the word being spoken at time t: the word whose span contains t,
// else the last word that has started (so the highlight holds across the
// tiny gaps between words). -1 before the first word.
export function wordAt(words: ReadonlyArray<TimedWord>, t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].s <= t) {
      last = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return last;
}
