import {describe, expect, it} from "vitest";

import {
  buildDataset,
  parseDataset,
  parsePeriod,
  splitSkillItems,
  type DatasetInput
} from "../api/dataset";

// Minimal stand-in for the real src/data/portfolio.ts shapes. Kept small on
// purpose: buildDataset is a pure projection, so the fixture only needs one
// entry per collection to pin the output contract.
function input(overrides: Partial<DatasetInput> = {}): DatasetInput {
  return {
    greeting: {
      username: "Ada L",
      subTitle: "I build things that ship.",
      resumePath: "/resume.pdf"
    },
    resumeContact: {
      name: "Ada L",
      title: "Full Stack Engineer",
      location: "Bangalore, India",
      email: "ada@example.com",
      site: "https://example.com",
      linkedin: "https://linkedin.example/ada",
      github: "https://github.example/ada"
    },
    socialMediaLinks: {
      github: "https://github.example/ada",
      linkedin: "https://linkedin.example/ada",
      gmail: "ada@example.com",
      twitter: "https://x.example/ada",
      rss: "https://example.com/blog/rss.xml"
    },
    workExperiences: [
      {
        role: "Software Engineer II",
        company: "MedMe Health",
        location: "Canada (remote)",
        date: "December 2025 – Present",
        desc: "Leading the RPA platform.",
        descBullets: ["Shipped an LLM extractor."]
      },
      {
        role: "SDE 2",
        company: "HyperVerge",
        location: "Bangalore",
        date: "April 2025 – December 2025",
        desc: "Owned platform architecture."
      }
    ],
    skillsSection: {
      subTitle: "FULL-STACK ENGINEER",
      skills: ["⚡ Build TypeScript end-to-end", "⚡ Design on AWS"]
    },
    skillsCategories: [
      {category: "Languages", items: "TypeScript, Python, SQL"},
      {
        category: "Full Stack",
        items:
          "TypeScript end-to-end — React.js; event-driven architecture (AWS SQS, EventBridge), microservices"
      }
    ],
    techStack: {
      experience: [
        {stack: "Backend (Node.js)", progressPercentage: "90%"},
        {stack: "Frontend (React)", progressPercentage: "80%"}
      ]
    },
    educationInfo: [
      {
        schoolName: "Kumaraguru College of Technology",
        subHeader: "Bachelor of Engineering in Computer Science",
        duration: "June 2019 - April 2023",
        desc: "Coimbatore, India.",
        descBullets: ["Focus on distributed systems."]
      }
    ],
    openSourceCard: {
      title: "AnkiDroid — Open Source Contributor",
      subtitle: "3 merged pull requests to AnkiDroid.",
      footerLink: [{name: "Image paste (#10320)", url: "https://gh.example/1"}]
    },
    isHireable: true,
    ...overrides
  };
}

describe("splitSkillItems", () => {
  it("splits on commas, semicolons and em dashes", () => {
    expect(splitSkillItems("TypeScript, Python; Bash — YAML")).toEqual([
      "TypeScript",
      "Python",
      "Bash",
      "YAML"
    ]);
  });

  it("keeps a parenthesised group with commas intact", () => {
    expect(
      splitSkillItems("event-driven architecture (AWS SQS, EventBridge), REST")
    ).toEqual(["event-driven architecture (AWS SQS, EventBridge)", "REST"]);
  });

  it("drops empty fragments", () => {
    expect(splitSkillItems("TypeScript,, ; Python")).toEqual([
      "TypeScript",
      "Python"
    ]);
  });
});

describe("parsePeriod", () => {
  it("reads an en-dash range into ISO year-months", () => {
    expect(parsePeriod("April 2025 – December 2025")).toEqual({
      startDate: "2025-04",
      endDate: "2025-12",
      current: false
    });
  });

  it("reads a hyphen range", () => {
    expect(parsePeriod("June 2019 - April 2023")).toEqual({
      startDate: "2019-06",
      endDate: "2023-04",
      current: false
    });
  });

  it("marks an open-ended range as current with a null endDate", () => {
    expect(parsePeriod("December 2025 – Present")).toEqual({
      startDate: "2025-12",
      endDate: null,
      current: true
    });
  });

  it("returns nulls for an unparseable period", () => {
    expect(parsePeriod("some time ago")).toEqual({
      startDate: null,
      endDate: null,
      current: false
    });
  });
});

describe("buildDataset", () => {
  it("projects the person block from the portfolio data", () => {
    const {person} = buildDataset(input());
    expect(person.name).toBe("Ada L");
    expect(person.headline).toBe("Full Stack Engineer");
    expect(person.pitch).toBe("I build things that ship.");
    expect(person.location).toBe("Bangalore, India");
    expect(person.email).toBe("ada@example.com");
    expect(person.site).toBe("https://example.com/");
    expect(person.availableForWork).toBe(true);
  });

  it("derives the current role from the open-ended experience entry", () => {
    const {person} = buildDataset(input());
    expect(person.currentRole).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      since: "2025-12"
    });
  });

  it("reports no current role when every entry has ended", () => {
    const data = input();
    const {person} = buildDataset({
      ...data,
      workExperiences: [data.workExperiences[1]]
    });
    expect(person.currentRole).toBeNull();
  });

  it("strips the bullet emoji from the focus statements", () => {
    expect(buildDataset(input()).person.focus).toEqual([
      "Build TypeScript end-to-end",
      "Design on AWS"
    ]);
  });

  it("builds absolute links including the resume PDF", () => {
    const byLabel = new Map(
      buildDataset(input()).links.map(l => [l.label, l.url])
    );
    expect(byLabel.get("Resume (PDF)")).toBe("https://example.com/resume.pdf");
    expect(byLabel.get("Email")).toBe("mailto:ada@example.com");
    expect(byLabel.get("GitHub")).toBe("https://github.example/ada");
    expect(byLabel.get("Blog")).toBe("https://example.com/blog/");
    expect(byLabel.get("OpenAPI spec")).toBe(
      "https://example.com/openapi.json"
    );
  });

  it("types each experience entry with dates and highlights", () => {
    const [first, second] = buildDataset(input()).experience;
    expect(first).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      location: "Canada (remote)",
      period: "December 2025 – Present",
      startDate: "2025-12",
      endDate: null,
      current: true,
      summary: "Leading the RPA platform.",
      highlights: ["Shipped an LLM extractor."]
    });
    expect(second.highlights).toEqual([]);
    expect(second.current).toBe(false);
  });

  it("splits each skill category into a typed list", () => {
    expect(buildDataset(input()).skills).toEqual([
      {category: "Languages", skills: ["TypeScript", "Python", "SQL"]},
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

  it("turns the proficiency percentages into numbers", () => {
    expect(buildDataset(input()).proficiencies).toEqual([
      {area: "Backend (Node.js)", level: 90},
      {area: "Frontend (React)", level: 80}
    ]);
  });

  it("projects education with parsed dates and no trailing period on location", () => {
    expect(buildDataset(input()).education).toEqual([
      {
        institution: "Kumaraguru College of Technology",
        credential: "Bachelor of Engineering in Computer Science",
        location: "Coimbatore, India",
        period: "June 2019 - April 2023",
        startDate: "2019-06",
        endDate: "2023-04",
        highlights: ["Focus on distributed systems."]
      }
    ]);
  });

  it("names the open-source project from the card title", () => {
    expect(buildDataset(input()).openSource).toEqual([
      {
        project: "AnkiDroid",
        role: "Open Source Contributor",
        description: "3 merged pull requests to AnkiDroid.",
        links: [{label: "Image paste (#10320)", url: "https://gh.example/1"}]
      }
    ]);
  });
});

describe("parseDataset", () => {
  it("accepts a document produced by buildDataset", () => {
    const built = buildDataset(input());
    const roundTripped = parseDataset(JSON.parse(JSON.stringify(built)));
    expect(roundTripped).toEqual(built);
  });

  it("rejects a non-object", () => {
    expect(parseDataset("nope")).toBeNull();
    expect(parseDataset(null)).toBeNull();
  });

  it("rejects a document with no person name", () => {
    const built = buildDataset(input()) as unknown as Record<string, unknown>;
    expect(parseDataset({...built, person: {}})).toBeNull();
  });

  it("rejects a document with a missing collection", () => {
    const {experience: _dropped, ...rest} = buildDataset(input());
    expect(parseDataset(rest)).toBeNull();
  });
});
