interface Stint<T> {
  company: string;
  span: string;
  location: string | null;
  roles: T[];
}

interface RoleLike {
  company: string;
  date: string;
  location: string;
}

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
      continue;
    }
    stints.push({
      company: role.company,
      span: "",
      location: null,
      roles: [role]
    });
  }
  for (const stint of stints) {
    stint.span = spanOf(stint.roles);
    const first = stint.roles[0].location;
    stint.location = stint.roles.every(r => r.location === first) ? first : null;
  }
  return stints;
}

interface YearMonth {
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

function parseMonth(label: string): YearMonth | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
  if (!month) return null;
  return { year: Number(m[2]), month };
}

function splitPeriod(
  period: string
): { start: YearMonth; end: YearMonth | null; openEnded: boolean } | null {
  const parts = period.split(RANGE_SEPARATOR);
  if (parts.length !== 2) return null;
  const start = parseMonth(parts[0]);
  if (!start) return null;
  if (OPEN_ENDED.test(parts[1].trim())) return { start, end: null, openEnded: true };
  return { start, end: parseMonth(parts[1]), openEnded: false };
}

export function periodBounds(period: string): { start: YearMonth; end: YearMonth | null } | null {
  const split = splitPeriod(period);
  if (!split) return null;
  if (split.openEnded) return { start: split.start, end: null };
  return split.end ? { start: split.start, end: split.end } : null;
}

const isoMonth = ({ year, month }: YearMonth) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;

type PeriodDates = { startDate: string | null; endDate: string | null; current: boolean };

export function parsePeriod(period: string): PeriodDates {
  const split = splitPeriod(period);
  if (!split) return { startDate: null, endDate: null, current: false };
  return {
    startDate: isoMonth(split.start),
    endDate: split.end ? isoMonth(split.end) : null,
    current: split.openEnded
  };
}

export function currentMonth(now = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const toIndex = (ym: YearMonth) => ym.year * 12 + (ym.month - 1);

// Months count inclusively (LinkedIn's convention): "April 2025 – December 2025" is 9.
export function monthsBetween({ start, end }: { start: YearMonth; end: YearMonth }): number {
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

export function totalExperienceMonths(periods: string[], now: YearMonth = currentMonth()): number {
  const ranges = periods
    .flatMap((period): Array<[number, number]> => {
      const bounds = periodBounds(period);
      return bounds ? [[toIndex(bounds.start), toIndex(bounds.end ?? now)]] : [];
    })
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of ranges) {
    if (cur && s <= cur[1] + 1) {
      cur[1] = Math.max(cur[1], e);
      continue;
    }
    if (cur) total += cur[1] - cur[0] + 1;
    cur = [s, e];
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

export function countCompanies(stints: ReadonlyArray<{ company: string }>): number {
  return new Set(stints.map(s => s.company)).size;
}
