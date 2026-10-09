import { describe, expect, it } from "vitest";

import { Dataset } from "#contracts/api/dataset.ts";
import { buildDataset, splitSkillItems, type DatasetInput } from "./dataset.ts";

const DATASET_INPUT: DatasetInput = {
  greeting: {
    username: "Murugappan M",
    subTitle: "I build B2B SaaS that ships in regulated industries.",
    resumePath: "/resume.pdf"
  },
  resumeContact: {
    name: "Murugappan M",
    title: "Full Stack Engineer",
    location: "Bangalore, India",
    email: "murugu2001@example.com",
    site: "https://murugappan.dev",
    linkedin: "https://linkedin.example/m",
    github: "https://github.example/m"
  },
  socialMediaLinks: {
    github: "https://github.example/m",
    linkedin: "https://linkedin.example/m",
    gmail: "murugu2001@example.com",
    twitter: "https://x.example/m",
    rss: "https://murugappan.dev/blog/rss.xml"
  },
  workExperiences: [
    {
      role: "Software Engineer II",
      company: "MedMe Health",
      location: "Canada (remote)",
      date: "December 2025 – Present",
      desc: "Event-driven RPA platform.",
      descBullets: ["Lifted extraction accuracy to 95%+."]
    }
  ],
  skillsSection: { subTitle: "FULL-STACK", skills: ["⚡ Build TypeScript"] },
  skillsCategories: [{ category: "Languages", items: "TypeScript, Python" }],
  techStack: {
    experience: [{ stack: "Backend", tools: [{ name: "Node.js" }], progressPercentage: "90%" }]
  },
  educationInfo: [
    {
      schoolName: "Kumaraguru College of Technology",
      subHeader: "B.E. Computer Science",
      duration: "June 2019 - April 2023",
      desc: "Coimbatore, India.",
      descBullets: ["Distributed systems."]
    }
  ],
  openSourceCard: {
    title: "AnkiDroid — Open Source Contributor",
    subtitle: "3 merged pull requests.",
    footerLink: [{ name: "Image paste", url: "https://gh.example/1" }]
  },
  isHireable: true
};

// The site fixture plus a finished role, a grade and a skill category
// with a parenthesised group, so every branch of the projection runs.
const input: DatasetInput = {
  ...DATASET_INPUT,
  workExperiences: [
    ...DATASET_INPUT.workExperiences,
    {
      role: "SDE 2",
      company: "HyperVerge",
      location: "Bangalore",
      date: "April 2025 – December 2025",
      desc: "Owned platform architecture."
    }
  ],
  skillsCategories: [
    ...DATASET_INPUT.skillsCategories,
    {
      category: "Full Stack",
      items:
        "TypeScript end-to-end — React.js; event-driven architecture (AWS SQS, EventBridge), microservices"
    }
  ],
  educationInfo: [{ ...DATASET_INPUT.educationInfo[0], grade: "CGPA 9.53 / 10" }]
};

describe("splitSkillItems", () => {
  it("drops empty fragments", () => {
    expect(splitSkillItems("TypeScript,, ; Python")).toEqual(["TypeScript", "Python"]);
  });
});

describe("buildDataset", () => {
  const dataset = buildDataset(input);

  // The Worker answers 503 for a dataset its schema rejects.
  it("builds a document the contract's schema accepts", () => {
    expect(Dataset.safeParse(dataset).success).toBe(true);
  });

  it("projects the person block from the portfolio data", () => {
    expect(dataset.person).toMatchObject({
      name: "Murugappan M",
      headline: "Full Stack Engineer",
      pitch: "I build B2B SaaS that ships in regulated industries.",
      location: "Bangalore, India",
      email: "murugu2001@example.com",
      site: "https://murugappan.dev/",
      availableForWork: true,
      // the bullet emoji is stripped from the focus statements
      focus: ["Build TypeScript"]
    });
  });

  it("derives the current role from the open-ended entry, and none once every entry has ended", () => {
    expect(dataset.person.currentRole).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      since: "2025-12"
    });
    const { person } = buildDataset({ ...input, workExperiences: [input.workExperiences[1]] });
    expect(person.currentRole).toBeNull();
  });

  it("builds absolute links including the resume PDF", () => {
    const byLabel = new Map(dataset.links.map(l => [l.label, l.url]));
    expect(byLabel.get("Resume (PDF)")).toBe("https://murugappan.dev/resume.pdf");
    expect(byLabel.get("Email")).toBe("mailto:murugu2001@example.com");
    expect(byLabel.get("GitHub")).toBe("https://github.example/m");
    expect(byLabel.get("Blog")).toBe("https://murugappan.dev/blog/");
    expect(byLabel.get("OpenAPI spec")).toBe("https://murugappan.dev/openapi.json");
  });

  it("types each experience entry with dates and highlights", () => {
    const [first, second] = dataset.experience;
    expect(first).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      location: "Canada (remote)",
      period: "December 2025 – Present",
      startDate: "2025-12",
      endDate: null,
      current: true,
      summary: "Event-driven RPA platform.",
      highlights: ["Lifted extraction accuracy to 95%+."]
    });
    expect(second.highlights).toEqual([]);
    expect(second.current).toBe(false);
  });

  it("splits each skill category into a typed list", () => {
    expect(dataset.skills).toEqual([
      { category: "Languages", skills: ["TypeScript", "Python"] },
      {
        category: "Full Stack",
        skills: [
          "TypeScript end-to-end",
          "React.js",
          "event-driven architecture (AWS SQS, EventBridge)",
          "microservices"
        ]
      }
    ]);
  });

  it("projects each proficiency with its tools and a numeric level", () => {
    expect(dataset.proficiencies).toEqual([{ area: "Backend", tools: ["Node.js"], level: 90 }]);
  });

  it("projects education with parsed dates and no trailing period on location", () => {
    expect(dataset.education).toEqual([
      {
        institution: "Kumaraguru College of Technology",
        credential: "B.E. Computer Science",
        location: "Coimbatore, India",
        period: "June 2019 - April 2023",
        startDate: "2019-06",
        endDate: "2023-04",
        grade: "CGPA 9.53 / 10",
        highlights: ["Distributed systems."]
      }
    ]);
    // The shared fixture's school entry has no grade.
    expect(buildDataset(DATASET_INPUT).education[0].grade).toBeNull();
  });

  it("names the open-source project from the card title", () => {
    expect(dataset.openSource).toEqual([
      {
        project: "AnkiDroid",
        role: "Open Source Contributor",
        description: "3 merged pull requests.",
        links: [{ label: "Image paste", url: "https://gh.example/1" }]
      }
    ]);
  });
});
