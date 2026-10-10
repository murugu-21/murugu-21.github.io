import { parseAccept, type Accept } from "hono/utils/accept";

type Rank = { q: number; order: number };

const UNRANKED: Rank = { q: 0, order: Number.POSITIVE_INFINITY };

/** RFC 9110 §12.5.1: a type takes the q of the most specific range that matches it. */
function rankOf(ranges: Accept[], type: string): Rank {
  const [main] = type.split("/");
  for (const candidate of [type, `${main}/*`, "*/*"]) {
    const order = ranges.findIndex(range => range.type.toLowerCase() === candidate);
    const range = ranges[order];
    if (range) return { q: range.q, order };
  }
  return UNRANKED;
}

const outranks = ({ rank, other }: { rank: Rank; other: Rank }) =>
  rank.q > other.q || (rank.q === other.q && rank.order < other.order);

function bestRank(ranges: Accept[], types: string[]): Rank {
  return types
    .map(type => rankOf(ranges, type))
    .reduce((best, rank) => (outranks({ rank, other: best }) ? rank : best), UNRANKED);
}

/**
 * Whether `Accept` ranks any of `preferred` above all of `others`, by q-value and then
 * by which range comes first. Not hono's `accepts`: its matcher never matches the
 * any-type range, and lets a wildcard outrank a specific type's lower q.
 */
export function ranksAbove(
  header: string | undefined,
  { preferred, others }: { preferred: string[]; others: string[] }
): boolean {
  const ranges = parseAccept(header ?? "");
  const rank = bestRank(ranges, preferred);
  return rank.q > 0 && outranks({ rank, other: bestRank(ranges, others) });
}
