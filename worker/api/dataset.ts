// The public API's data comes from the site's own content build, not from a
// second copy of it: `src/pages/api/dataset.json.ts` is an Astro static
// endpoint that feeds `src/data/portfolio.ts` + `src/data/resume.ts` through
// `buildDataset()` and prerenders the result to `dist/api/dataset.json`. The
// Worker reads that file back through the ASSETS binding (same pattern as
// grounding.ts), so /api/*, the rendered pages and the resume PDF can never
// drift from each other.
//
// Only the fields the API projects are declared as input, structurally — that
// keeps this module free of any `astro` import (portfolio.ts types its logos
// as ImageMetadata) so the Worker and its tests can use it directly.

export type Link = {label: string; url: string};

export type ExperienceEntry = {
  role: string;
  company: string;
  location: string;
  /** Human-readable range exactly as it appears on the site. */
  period: string;
  /** ISO 8601 year-month, or null when the period could not be parsed. */
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  summary: string;
  highlights: string[];
};

export type SkillCategory = {category: string; skills: string[]};

export type Proficiency = {area: string; level: number};

export type EducationEntry = {
  institution: string;
  credential: string;
  location: string;
  period: string;
  startDate: string | null;
  endDate: string | null;
  highlights: string[];
};

export type OpenSourceContribution = {
  project: string;
  role: string;
  description: string;
  links: Link[];
};

export type Person = {
  name: string;
  headline: string;
  pitch: string;
  location: string;
  email: string;
  site: string;
  availableForWork: boolean;
  currentRole: {role: string; company: string; since: string | null} | null;
  focus: string[];
};

export type Dataset = {
  person: Person;
  links: Link[];
  experience: ExperienceEntry[];
  skills: SkillCategory[];
  proficiencies: Proficiency[];
  education: EducationEntry[];
  openSource: OpenSourceContribution[];
};

export type DatasetInput = {
  greeting: {username: string; subTitle: string; resumePath: string};
  resumeContact: {
    name: string;
    title: string;
    location: string;
    email: string;
    site: string;
    linkedin: string;
    github: string;
  };
  socialMediaLinks: {
    github: string;
    linkedin: string;
    gmail: string;
    twitter: string;
    rss: string;
  };
  workExperiences: ReadonlyArray<{
    role: string;
    company: string;
    location: string;
    date: string;
    desc: string;
    descBullets?: string[];
  }>;
  skillsSection: {subTitle: string; skills: string[]};
  skillsCategories: ReadonlyArray<{category: string; items: string}>;
  techStack: {
    experience: ReadonlyArray<{stack: string; progressPercentage: string}>;
  };
  educationInfo: ReadonlyArray<{
    schoolName: string;
    subHeader: string;
    duration: string;
    desc: string;
    descBullets: string[];
  }>;
  openSourceCard: {
    title: string;
    subtitle: string;
    footerLink: ReadonlyArray<{name: string; url: string}>;
  };
  isHireable: boolean;
};

// Same splitting rule the JSON-LD `knowsAbout` list uses in Layout.astro:
// break on semicolons and em dashes, and on commas that are NOT inside a
// parenthesised group (so "(AWS SQS, EventBridge)" survives as one item).
export function splitSkillItems(items: string): string[] {
  return items
    .split(/;|—|,(?![^()]*\))/)
    .map(part => part.trim())
    .filter(Boolean);
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

function toYearMonth(part: string): string | null {
  const match = part.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  return `${match[2]}-${String(month + 1).padStart(2, "0")}`;
}

export type Period = {
  startDate: string | null;
  endDate: string | null;
  current: boolean;
};

const OPEN_ENDED = /^(present|current|now)$/i;

// The site writes ranges as "December 2025 – Present" / "June 2019 - April
// 2023" (en dash, em dash or hyphen). Anything else yields nulls rather than
// a guess — a wrong date is worse for an agent than an absent one.
export function parsePeriod(period: string): Period {
  const parts = period.split(/\s+[–—-]\s+/);
  if (parts.length !== 2)
    return {startDate: null, endDate: null, current: false};
  const startDate = toYearMonth(parts[0]);
  if (!startDate) return {startDate: null, endDate: null, current: false};
  const tail = parts[1].trim();
  if (OPEN_ENDED.test(tail)) return {startDate, endDate: null, current: true};
  return {startDate, endDate: toYearMonth(tail), current: false};
}

export function buildDataset(input: DatasetInput): Dataset {
  const {
    greeting,
    resumeContact,
    socialMediaLinks,
    workExperiences,
    skillsSection,
    skillsCategories,
    techStack,
    educationInfo,
    openSourceCard,
    isHireable
  } = input;
  const site = resumeContact.site.replace(/\/$/, "");
  const absolute = (path: string) => `${site}${path}`;

  const experience: ExperienceEntry[] = workExperiences.map(job => ({
    role: job.role,
    company: job.company,
    location: job.location,
    period: job.date,
    ...parsePeriod(job.date),
    summary: job.desc,
    highlights: job.descBullets ?? []
  }));
  const currentJob = experience.find(job => job.current) ?? null;

  const [project, role] = openSourceCard.title.split(/\s+—\s+/);

  return {
    person: {
      name: resumeContact.name,
      headline: resumeContact.title,
      pitch: greeting.subTitle,
      location: resumeContact.location,
      email: resumeContact.email,
      site: `${site}/`,
      availableForWork: isHireable,
      currentRole: currentJob
        ? {
            role: currentJob.role,
            company: currentJob.company,
            since: currentJob.startDate
          }
        : null,
      // The site prefixes each statement with a "⚡" bullet for display.
      focus: skillsSection.skills.map(s => s.replace(/^[\s⚡•-]+/, "").trim())
    },
    links: [
      {label: "Website", url: `${site}/`},
      {label: "About (canonical entity page)", url: absolute("/about/")},
      {label: "Blog", url: absolute("/blog/")},
      {label: "Blog RSS", url: socialMediaLinks.rss},
      {label: "Resume (PDF)", url: absolute(greeting.resumePath)},
      {label: "GitHub", url: socialMediaLinks.github},
      {label: "LinkedIn", url: socialMediaLinks.linkedin},
      {label: "X / Twitter", url: socialMediaLinks.twitter},
      {label: "Email", url: `mailto:${socialMediaLinks.gmail}`},
      {label: "Developer portal", url: absolute("/developers/")},
      {label: "OpenAPI spec", url: absolute("/openapi.json")},
      {label: "llms.txt", url: absolute("/llms.txt")},
      {label: "Agent instructions", url: absolute("/AGENTS.md")}
    ],
    experience,
    skills: skillsCategories.map(c => ({
      category: c.category,
      skills: splitSkillItems(c.items)
    })),
    proficiencies: techStack.experience.map(e => ({
      area: e.stack,
      level: Number.parseInt(e.progressPercentage, 10)
    })),
    education: educationInfo.map(school => ({
      institution: school.schoolName,
      credential: school.subHeader,
      location: school.desc.replace(/\.$/, ""),
      period: school.duration,
      ...(({current: _current, ...dates}) => dates)(
        parsePeriod(school.duration)
      ),
      highlights: school.descBullets
    })),
    openSource: [
      {
        project: (project ?? openSourceCard.title).trim(),
        role: (role ?? "").trim(),
        description: openSourceCard.subtitle,
        links: openSourceCard.footerLink.map(l => ({
          label: l.name,
          url: l.url
        }))
      }
    ]
  };
}

const COLLECTIONS = [
  "links",
  "experience",
  "skills",
  "proficiencies",
  "education",
  "openSource"
] as const;

// The dataset arrives over the ASSETS binding, i.e. from a build artifact
// rather than from this module's own memory — so it is validated before use.
// A stale or truncated file must surface as a 503 with a hint, never as
// `undefined` leaking into a 200 response body.
export function parseDataset(raw: unknown): Dataset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const doc = raw as Record<string, unknown>;
  const person = doc.person;
  if (typeof person !== "object" || person === null) return null;
  if (typeof (person as Record<string, unknown>).name !== "string") return null;
  for (const key of COLLECTIONS) if (!Array.isArray(doc[key])) return null;
  return doc as unknown as Dataset;
}
