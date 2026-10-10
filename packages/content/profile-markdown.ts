// The about page and the resume as markdown, with the same sections as their HTML pages, from
// the same data. Both lay out experience alike. Links are absolute so the text is useful when quoted.
import { groupByCompany } from "./experience.ts";
import {
  aboutLinks,
  currentEmployer,
  educationInfo,
  greeting,
  openSourceCard,
  skillsCategories,
  workExperiences
} from "./portfolio.ts";
import { displayUrl, resumeContact } from "./resume.ts";
import { SITE_ORIGIN } from "./site.ts";

/** A pinned GitHub repo as the resume lists it. */
interface ResumeProject {
  name: string;
  description: string;
  homepageUrl: string | null;
}

const link = ({ label, href }: { label: string; href: string }) =>
  `[${label}](${href.startsWith("/") ? SITE_ORIGIN : ""}${href})`;
const bullets = (items: string[]) => items.map(item => `- ${item}`).join("\n");
const markdown = (blocks: string[]) => `${blocks.join("\n\n")}\n`;

const skillBlocks = () => [
  "## Skills",
  bullets(skillsCategories.map(({ category, items }) => `**${category}:** ${items}`))
];

function experienceBlocks(): string[] {
  return [
    "## Experience",
    ...groupByCompany(workExperiences).flatMap(stint => [
      `### ${stint.company}`,
      stint.location ? `${stint.span} · ${stint.location}` : stint.span,
      ...stint.roles.flatMap(role => [
        `#### ${role.role}${role.partTime ? " (Part-time)" : ""}`,
        // A lone role's dates already sit under the company.
        ...(stint.roles.length > 1
          ? [stint.location ? role.date : `${role.date} · ${role.location}`]
          : []),
        role.desc,
        ...(role.descBullets?.length ? [bullets(role.descBullets)] : [])
      ])
    ])
  ];
}

/** /about/index.md */
export const aboutMarkdown = () =>
  markdown([
    `# About ${resumeContact.name}`,
    greeting.subTitle,
    `${resumeContact.title} · ${resumeContact.location} · currently at ${link({ label: currentEmployer.name, href: currentEmployer.url })}`,
    bullets(aboutLinks.map(link)),
    ...experienceBlocks(),
    ...skillBlocks(),
    "## Education",
    ...educationInfo.flatMap(school => [
      `### ${school.schoolName}`,
      `${school.subHeader} · ${school.duration}`,
      bullets(school.descBullets)
    ]),
    "## Open source",
    openSourceCard.subtitle,
    bullets(openSourceCard.footerLink.map(({ name, url }) => link({ label: name, href: url }))),
    // The prose of about.astro's "For AI agents" section, which has inline links.
    "## For AI agents",
    `This page is the canonical source of truth about ${resumeContact.name}. A machine-readable version lives at ${link({ label: "/llms.txt", href: "/llms.txt" })}, and full blog content is at ${link({ label: "/blog/llms-full.txt", href: "/blog/llms-full.txt" })}.`,
    `A public, unauthenticated API also serves everything on this page as JSON. Start with ${link({ label: "`GET /api/v1/profile`", href: "/api/v1/profile" })}. The full contract is the ${link({ label: "OpenAPI 3.1.0 spec", href: "/openapi.json" })}. The ${link({ label: "developer portal", href: "/developers/" })} documents the endpoints, versioning policy and rate-limit headers. There is an ${link({ label: "MCP server", href: "/mcp" })} with a ${link({ label: "manifest", href: "/.well-known/mcp.json" })}, and ${link({ label: "/AGENTS.md", href: "/AGENTS.md" })} says when to use this site and which call to make.`
  ]);

const urlLink = (url: string) => link({ label: displayUrl(url), href: url });

/** /resume/index.md. The phone is left out unless given, as on the HTML page. */
export function resumeMarkdown({
  phone,
  projects
}: {
  phone?: string;
  projects: ResumeProject[];
}): string {
  const { name, title, location, email, linkedin, github, site } = resumeContact;
  const contact = [
    location,
    ...(phone ? [phone] : []),
    link({ label: email, href: `mailto:${email}` }),
    ...[linkedin, github, site].map(urlLink)
  ];
  return markdown([
    `# ${name}`,
    title,
    contact.join(" | "),
    "## Professional Summary",
    greeting.subTitle,
    ...skillBlocks(),
    ...experienceBlocks(),
    ...(projects.length > 0
      ? [
          "## Projects",
          ...projects.flatMap(project => [
            `### ${project.name}`,
            ...(project.homepageUrl ? [urlLink(project.homepageUrl)] : []),
            project.description
          ])
        ]
      : []),
    "## Education",
    ...educationInfo.flatMap(school => [
      `### ${school.schoolName}, ${school.desc.replace(/\.$/, "")} | ${school.subHeader}`,
      school.grade ? `${school.duration} · ${school.grade}` : school.duration
    ])
  ]);
}
