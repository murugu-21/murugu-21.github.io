// Groups the flat, most-recent-first workExperiences list into company
// stints for the Experiences section. Grouping is by *consecutive* company so
// a return to a former employer renders as its own stint rather than being
// merged into the earlier one. The shared data in src/data/portfolio.ts stays
// flat because the resume, about page and dataset API all consume it as-is.

export interface Stint<T> {
  company: string;
  /** "oldest start – newest end", or the role's own date for a single role. */
  span: string;
  /** Shared location when every role agrees, otherwise null (shown per role). */
  location: string | null;
  roles: T[];
}

interface RoleLike {
  company: string;
  date: string;
  location: string;
}

// Mirrors worker/api/dataset.ts parsePeriod: en dash, em dash or hyphen.
const RANGE_SEPARATOR = /\s+[–—-]\s+/;

function spanOf(roles: RoleLike[]): string {
  if (roles.length === 1) return roles[0].date;
  const newest = roles[0].date.split(RANGE_SEPARATOR);
  const oldest = roles[roles.length - 1].date.split(RANGE_SEPARATOR);
  return `${oldest[0]} – ${newest[newest.length - 1]}`;
}

export function groupByCompany<T extends RoleLike>(roles: T[]): Stint<T>[] {
  const stints: Stint<T>[] = [];
  for (const role of roles) {
    const last = stints[stints.length - 1];
    if (last && last.company === role.company) {
      last.roles.push(role);
    } else {
      stints.push({
        company: role.company,
        span: "",
        location: null,
        roles: [role]
      });
    }
  }
  for (const stint of stints) {
    stint.span = spanOf(stint.roles);
    const first = stint.roles[0].location;
    stint.location = stint.roles.every(r => r.location === first)
      ? first
      : null;
  }
  return stints;
}

// ---- durations -------------------------------------------------------------
// The site writes ranges as "Month YYYY – Month YYYY" or "Month YYYY – Present".
// Months are counted inclusively at both ends (LinkedIn's convention), so
// "April 2025 – December 2025" is 9 months. Open ranges are measured to the
// current month; the component re-runs this in the browser so a "Present" role
// keeps ticking between deploys.

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

const OPEN_ENDED = /^(present|now|current)$/i;

export function parseMonth(label: string): YearMonth | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!month) return null;
  return {year: Number(m[2]), month};
}

export function periodBounds(
  period: string
): {start: YearMonth; end: YearMonth | null} | null {
  const parts = period.split(RANGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const start = parseMonth(parts[0]);
  if (!start) return null;
  if (OPEN_ENDED.test(parts[1].trim())) return {start, end: null};
  const end = parseMonth(parts[1]);
  return end ? {start, end} : null;
}

export function currentMonth(now = new Date()): YearMonth {
  return {year: now.getFullYear(), month: now.getMonth() + 1};
}

const toIndex = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);

export function monthsBetween(start: YearMonth, end: YearMonth): number {
  return Math.max(0, toIndex(end) - toIndex(start) + 1);
}

export function formatDuration(months: number): string {
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  const parts: string[] = [];
  if (yrs) parts.push(`${yrs} ${yrs === 1 ? "yr" : "yrs"}`);
  if (mos || !yrs) parts.push(`${mos} ${mos === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

/** Months covered by the union of the given ranges (overlaps counted once). */
export function totalExperienceMonths(
  periods: string[],
  now: YearMonth = currentMonth()
): number {
  const ranges = periods
    .map(periodBounds)
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .map(b => [toIndex(b.start), toIndex(b.end ?? now)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of ranges) {
    if (cur && s <= cur[1] + 1) {
      cur[1] = Math.max(cur[1], e);
    } else {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [s, e];
    }
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

/**
 * Distinct companies across the given stints. Grouping is by *consecutive*
 * company, so a return to a former employer is two stints but still one
 * company — headline counts have to de-duplicate by name, not count stints.
 */
export function countCompanies(
  stints: ReadonlyArray<{company: string}>
): number {
  return new Set(stints.map(s => s.company)).size;
}
