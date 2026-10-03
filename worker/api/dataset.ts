// `src/pages/api/dataset.json.ts` prerenders `buildDataset()` over the site's own data to
// `dist/api/dataset.json`, which the Worker reads via ASSETS, so the API cannot drift from the site.
// Input is typed structurally to keep `astro` imports (ImageMetadata) out of the Worker.

import { z } from "zod";

const Link = z.object({ label: z.string(), url: z.string() });

const nullableString = z.string().nullable();

const ExperienceEntry = z.object({
  role: z.string(),
  company: z.string(),
  location: z.string(),
  /** As displayed on the site. */
  period: z.string(),
  /** ISO 8601 year-month, or null when the period could not be parsed. */
  startDate: nullableString,
  endDate: nullableString,
  current: z.boolean(),
  summary: z.string(),
  highlights: z.array(z.string())
});
type ExperienceEntry = z.infer<typeof ExperienceEntry>;

const SkillCategory = z.object({ category: z.string(), skills: z.array(z.string()) });

const Proficiency = z.object({ area: z.string(), tools: z.array(z.string()), level: z.number() });

const EducationEntry = z.object({
  institution: z.string(),
  credential: z.string(),
  location: z.string(),
  period: z.string(),
  startDate: nullableString,
  endDate: nullableString,
  /** Grade as the site displays it (e.g. "CGPA 9.53 / 10"), or null. */
  grade: nullableString,
  highlights: z.array(z.string())
});

const OpenSourceContribution = z.object({
  project: z.string(),
  role: z.string(),
  description: z.string(),
  links: z.array(Link)
});

const Person = z.object({
  name: z.string(),
  headline: z.string(),
  pitch: z.string(),
  location: z.string(),
  email: z.string(),
  site: z.string(),
  availableForWork: z.boolean(),
  currentRole: z
    .object({ role: z.string(), company: z.string(), since: nullableString })
    .nullable(),
  focus: z.array(z.string())
});

export const Dataset = z.object({
  person: Person,
  links: z.array(Link),
  experience: z.array(ExperienceEntry),
  skills: z.array(SkillCategory),
  proficiencies: z.array(Proficiency),
  education: z.array(EducationEntry),
  openSource: z.array(OpenSourceContribution)
});
export type Dataset = z.infer<typeof Dataset>;

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

type Period = {
  startDate: string | null;
  endDate: string | null;
  current: boolean;
};

const OPEN_ENDED = /^(present|current|now)$/i;

// Parses "December 2025 – Present" / "June 2019 - April 2023". Anything else yields nulls: a
// wrong date is worse for an agent than an absent one.
export function parsePeriod(period: string): Period {
  const parts = period.split(/\s+[–—-]\s+/);
  const startDate = parts.length === 2 ? toYearMonth(parts[0]) : null;
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

// A stale or truncated build artifact must surface as a 503, not as `undefined` in a 200 body.
export function parseDataset(raw: unknown): Dataset | null {
  return Dataset.safeParse(raw).data ?? null;
}
