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
