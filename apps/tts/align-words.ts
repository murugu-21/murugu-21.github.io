// Word-level timing for the read-aloud highlight: maps whisper's words onto
// a block's known text. The page's player maps DOM spans to these times
// (apps/site/src/lib/blog/audio-words.ts).
import type { TimedWord } from "@murugappan/contracts/audio-timings.ts";
import { tokenize } from "@murugappan/content/speech.ts";

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
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
