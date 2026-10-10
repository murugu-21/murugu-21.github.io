// Builds the dataset in packages/contracts/api/dataset.ts from portfolio.ts and resume.ts.
// Input is typed structurally so a test can build a small one.

import type { Dataset, ExperienceEntry } from "@murugappan/contracts/api/dataset.ts";
import { parsePeriod } from "./experience.ts";
import * as portfolio from "./portfolio.ts";
import * as resume from "./resume.ts";

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
      tools: ReadonlyArray<{ name: string }>;
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
  openSourceContributions: ReadonlyArray<{
    project: string;
    role: string;
    description: string;
    links: ReadonlyArray<{ label: string; url: string }>;
  }>;
  isHireable: boolean;
};

// Commas inside parentheses do not split: "(AWS SQS, EventBridge)" stays one item.
export function splitSkillItems(items: string): string[] {
  return items
    .split(/;|—|,(?![^()]*\))/)
    .map(part => part.trim())
    .filter(Boolean);
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
    openSourceContributions,
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
      // Names only: the icon keys are a rendering concern.
      tools: e.tools.map(t => t.name),
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
    // Drops the card image, which only the homepage shows.
    openSource: openSourceContributions.map(({ project, role, description, links }) => ({
      project,
      role,
      description,
      links: [...links]
    }))
  };
}

export const siteDataset = (): Dataset => buildDataset({ ...portfolio, ...resume });
