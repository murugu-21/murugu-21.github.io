// `src/pages/api/dataset.json.ts` prerenders `buildDataset()` over the site's own data to
// `dist/api/dataset.json`, which the Worker reads via ASSETS, so the API cannot drift from the site.
// Input is typed structurally to keep `astro` imports (ImageMetadata) out of the Worker.

export type Link = { label: string; url: string };

export type ExperienceEntry = {
  role: string;
  company: string;
  location: string;
  /** As displayed on the site. */
  period: string;
  /** ISO 8601 year-month, or null when the period could not be parsed. */
  startDate: string | null;
  endDate: string | null;
  current: boolean;
  summary: string;
  highlights: string[];
};

export type SkillCategory = { category: string; skills: string[] };

export type Proficiency = { area: string; tools: string[]; level: number };

export type EducationEntry = {
  institution: string;
  credential: string;
  location: string;
  period: string;
  startDate: string | null;
  endDate: string | null;
  /** Grade as the site displays it (e.g. "CGPA 9.53 / 10"), or null. */
  grade: string | null;
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
  currentRole: { role: string; company: string; since: string | null } | null;
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
  greeting: { username: string; subTitle: string; resumePath: string };
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
  skillsSection: { subTitle: string; skills: string[] };
  skillsCategories: ReadonlyArray<{ category: string; items: string }>;
  techStack: {
    experience: ReadonlyArray<{
      stack: string;
      tools: ReadonlyArray<string>;
      progressPercentage: string;
    }>;
  };
  educationInfo: ReadonlyArray<{
    schoolName: string;
    subHeader: string;
    duration: string;
    desc: string;
    grade?: string;
    descBullets: string[];
  }>;
  openSourceCard: {
    title: string;
    subtitle: string;
    footerLink: ReadonlyArray<{ name: string; url: string }>;
  };
  isHireable: boolean;
};

// Same rule as `knowsAbout` in Layout.astro: commas inside parentheses do not split.
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

// Parses "December 2025 – Present" / "June 2019 - April 2023". Anything else yields nulls: a
// wrong date is worse for an agent than an absent one.
export function parsePeriod(period: string): Period {
  const parts = period.split(/\s+[–—-]\s+/);
  if (parts.length !== 2) return { startDate: null, endDate: null, current: false };
  const startDate = toYearMonth(parts[0]);
  if (!startDate) return { startDate: null, endDate: null, current: false };
  const tail = parts[1].trim();
  if (OPEN_ENDED.test(tail)) return { startDate, endDate: null, current: true };
  return { startDate, endDate: toYearMonth(tail), current: false };
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

  const [project = openSourceCard.title, role = ""] = openSourceCard.title.split(/\s+—\s+/);

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
      { label: "Website", url: `${site}/` },
      { label: "About (canonical entity page)", url: absolute("/about/") },
      { label: "Blog", url: absolute("/blog/") },
      { label: "Blog RSS", url: socialMediaLinks.rss },
      { label: "Resume (PDF)", url: absolute(greeting.resumePath) },
      { label: "GitHub", url: socialMediaLinks.github },
      { label: "LinkedIn", url: socialMediaLinks.linkedin },
      { label: "X / Twitter", url: socialMediaLinks.twitter },
      { label: "Email", url: `mailto:${socialMediaLinks.gmail}` },
      { label: "Developer portal", url: absolute("/developers/") },
      { label: "OpenAPI spec", url: absolute("/openapi.json") },
      { label: "llms.txt", url: absolute("/llms.txt") },
      { label: "Agent instructions", url: absolute("/AGENTS.md") }
    ],
    experience,
    skills: skillsCategories.map(c => ({
      category: c.category,
      skills: splitSkillItems(c.items)
    })),
    proficiencies: techStack.experience.map(e => ({
      area: e.stack,
      tools: [...e.tools],
      level: Number.parseInt(e.progressPercentage, 10)
    })),
    education: educationInfo.map(school => {
      const { startDate, endDate } = parsePeriod(school.duration);
      return {
        institution: school.schoolName,
        credential: school.subHeader,
        location: school.desc.replace(/\.$/, ""),
        period: school.duration,
        startDate,
        endDate,
        grade: school.grade ?? null,
        highlights: school.descBullets
      };
    }),
    openSource: [
      {
        project: project.trim(),
        role: role.trim(),
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

// A stale or truncated build artifact must surface as a 503, not as `undefined` in a 200 body.
export function parseDataset(raw: unknown): Dataset | null {
  if (typeof raw !== "object" || raw === null) return null;
  const doc = raw as Record<string, unknown>;
  const person = doc.person;
  if (typeof person !== "object" || person === null) return null;
  if (typeof (person as Record<string, unknown>).name !== "string") return null;
  for (const key of COLLECTIONS) if (!Array.isArray(doc[key])) return null;
  return doc as unknown as Dataset;
}
