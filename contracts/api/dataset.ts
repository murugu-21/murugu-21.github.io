// `src/pages/api/dataset.json.ts` prerenders `buildDataset()` over the site's own data to
// `dist/api/dataset.json`, which the Worker reads via ASSETS, so the API cannot drift from the site.
// Input is typed structurally to keep `astro` imports (ImageMetadata) out of contracts.

import { z } from "zod";

import { nullableText, text } from "./fields";

const list = (description: string) => z.array(z.string()).meta({ description });

export const Link = z
  .object({
    label: text("Human-readable name for the destination."),
    url: text("Absolute URL.", { format: "uri" })
  })
  .meta({ title: "Link", description: "A labelled public URL." });

export const CurrentRole = z
  .object({
    role: text("Job title."),
    company: text("Employer name."),
    since: nullableText("ISO 8601 year-month the role started, or null if unknown.", {
      examples: ["2025-12"]
    })
  })
  .meta({ title: "CurrentRole", description: "The role held right now, if any." });

export const Person = z
  .object({
    name: text("Full name."),
    headline: text("Professional title.", { examples: ["Full Stack Engineer"] }),
    pitch: text("Elevator pitch, as published on the site."),
    location: text("City and country he is based in."),
    email: text("Public contact address.", { format: "email" }),
    site: text("Canonical site URL.", { format: "uri" }),
    availableForWork: z.boolean().meta({ description: "Whether he is open to new opportunities." }),
    currentRole: CurrentRole.nullable().meta({
      description: "The role held right now, or null between roles."
    }),
    focus: list("One statement per line of the site's 'What I do' section, in his own words.")
  })
  .meta({ title: "Person", description: "The single person this API describes." });

export const ExperienceEntry = z
  .object({
    role: text("Job title."),
    company: text("Employer name."),
    location: text("Where the role was based."),
    period: text("The range exactly as the site displays it.", {
      examples: ["December 2025 – Present"]
    }),
    startDate: nullableText("ISO 8601 year-month the role started, or null if unparseable.", {
      examples: ["2025-12"]
    }),
    endDate: nullableText("ISO 8601 year-month the role ended; null while it is ongoing.", {
      examples: ["2025-12"]
    }),
    current: z.boolean().meta({ description: "Whether this is the role held right now." }),
    summary: text("One line on what the role was about."),
    highlights: list("Concrete achievements in the role.")
  })
  .meta({ title: "ExperienceEntry", description: "One role in the work history." });
type ExperienceEntry = z.infer<typeof ExperienceEntry>;

export const SkillCategory = z
  .object({
    category: text("Group name.", { examples: ["Cloud & Infra"] }),
    skills: list("The individual technologies in the group.")
  })
  .meta({ title: "SkillCategory", description: "One group of related technologies." });

export const Proficiency = z
  .object({
    area: text("The area being rated."),
    tools: list("Named technologies within the area."),
    level: z.int().min(0).max(100).meta({ description: "Self-reported level from 0 to 100." })
  })
  .meta({ title: "Proficiency", description: "Self-reported depth in a broad area." });

export const EducationEntry = z
  .object({
    institution: text("School or university name."),
    credential: text("The degree or certificate earned."),
    location: text("Where the institution is."),
    period: text("The range exactly as the site displays it."),
    startDate: nullableText("ISO 8601 year-month of enrolment, or null."),
    endDate: nullableText("ISO 8601 year-month of completion, or null."),
    grade: nullableText('Final grade as the site displays it (e.g. "CGPA 9.53 / 10"), or null.'),
    highlights: list("Notable details about the studies.")
  })
  .meta({ title: "EducationEntry", description: "One formal qualification." });

export const OpenSourceContribution = z
  .object({
    project: text("The project contributed to.", { examples: ["AnkiDroid"] }),
    role: text("The role held on the project."),
    description: text("What the contributions were."),
    links: z.array(Link).meta({
      description:
        "Links to the individual merged pull requests, so the claim can be checked at the source."
    })
  })
  .meta({ title: "OpenSourceContribution", description: "Public contributions to one project." });

export const Dataset = z.object({
  person: Person,
  links: z.array(Link).meta({ description: "Every public link, including machine-readable ones." }),
  experience: z.array(ExperienceEntry).meta({ description: "Roles, newest first." }),
  skills: z.array(SkillCategory).meta({ description: "Technologies grouped by category." }),
  proficiencies: z.array(Proficiency).meta({ description: "Self-reported depth per broad area." }),
  education: z.array(EducationEntry).meta({ description: "Qualifications, newest first." }),
  openSource: z.array(OpenSourceContribution).meta({ description: "One entry per project." })
});
export type Dataset = z.infer<typeof Dataset>;

// Response bodies of the dataset endpoints and tools: each is a slice of the dataset.
export const Profile = Dataset.pick({ person: true, links: true }).meta({
  title: "Profile",
  description: "Response body of getProfile."
});
export const ExperienceList = Dataset.pick({ experience: true }).meta({
  title: "ExperienceList",
  description: "Response body of listExperience."
});
export const SkillsResponse = Dataset.pick({ skills: true, proficiencies: true }).meta({
  title: "SkillsResponse",
  description: "Response body of listSkills."
});
export const EducationList = Dataset.pick({ education: true }).meta({
  title: "EducationList",
  description: "Response body of listEducation."
});
export const OpenSourceList = Dataset.pick({ openSource: true }).meta({
  title: "OpenSourceList",
  description: "Response body of listOpenSourceContributions."
});

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

// Parses "December 2025 – Present" / "June 2019 - April 2023". Anything else yields nulls,
// because a wrong date is worse for an agent than an absent one.
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
