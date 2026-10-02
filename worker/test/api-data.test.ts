// The parsers and projections behind the read and write endpoints: the
// dataset built from src/data/portfolio.ts, the post list read from llms.txt
// and the contact form body.
import { describe, expect, it } from "vitest";

import { CONTACT_LIMITS, parseContactRequest } from "../api/contact";
import {
  buildDataset,
  parseDataset,
  parsePeriod,
  splitSkillItems,
  type DatasetInput
} from "../api/dataset";
import { parsePostList, postMarkdownPath } from "../api/posts";

// Minimal stand-in for src/data/portfolio.ts: buildDataset is a pure
// projection, so one entry per collection pins the output contract.
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
      { category: "Languages", items: "TypeScript, Python, SQL" },
      {
        category: "Full Stack",
        items:
          "TypeScript end-to-end — React.js; event-driven architecture (AWS SQS, EventBridge), microservices"
      }
    ],
    techStack: {
      experience: [
        {
          stack: "Backend",
          tools: ["Node.js", "Nest.js"],
          progressPercentage: "90%"
        },
        { stack: "Frontend", tools: ["React"], progressPercentage: "80%" }
      ]
    },
    educationInfo: [
      {
        schoolName: "Kumaraguru College of Technology",
        subHeader: "Bachelor of Engineering in Computer Science",
        grade: "CGPA 9.53 / 10",
        duration: "June 2019 - April 2023",
        desc: "Coimbatore, India.",
        descBullets: ["Focus on distributed systems."]
      }
    ],
    openSourceCard: {
      title: "AnkiDroid — Open Source Contributor",
      subtitle: "3 merged pull requests to AnkiDroid.",
      footerLink: [{ name: "Image paste (#10320)", url: "https://gh.example/1" }]
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
    expect(splitSkillItems("event-driven architecture (AWS SQS, EventBridge), REST")).toEqual([
      "event-driven architecture (AWS SQS, EventBridge)",
      "REST"
    ]);
  });

  it("drops empty fragments", () => {
    expect(splitSkillItems("TypeScript,, ; Python")).toEqual(["TypeScript", "Python"]);
  });
});

describe("parsePeriod", () => {
  it.each([
    {
      period: "April 2025 – December 2025",
      startDate: "2025-04",
      endDate: "2025-12",
      current: false
    },
    { period: "June 2019 - April 2023", startDate: "2019-06", endDate: "2023-04", current: false },
    { period: "December 2025 – Present", startDate: "2025-12", endDate: null, current: true },
    { period: "some time ago", startDate: null, endDate: null, current: false }
  ])("reads $period", ({ period, startDate, endDate, current }) => {
    expect(parsePeriod(period)).toEqual({ startDate, endDate, current });
  });
});

describe("buildDataset", () => {
  it("projects the person block from the portfolio data", () => {
    const { person } = buildDataset(input());
    expect(person.name).toBe("Ada L");
    expect(person.headline).toBe("Full Stack Engineer");
    expect(person.pitch).toBe("I build things that ship.");
    expect(person.location).toBe("Bangalore, India");
    expect(person.email).toBe("ada@example.com");
    expect(person.site).toBe("https://example.com/");
    expect(person.availableForWork).toBe(true);
  });

  it("derives the current role from the open-ended experience entry", () => {
    const { person } = buildDataset(input());
    expect(person.currentRole).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      since: "2025-12"
    });
  });

  it("reports no current role when every entry has ended", () => {
    const data = input();
    const { person } = buildDataset({
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
    const byLabel = new Map(buildDataset(input()).links.map(l => [l.label, l.url]));
    expect(byLabel.get("Resume (PDF)")).toBe("https://example.com/resume.pdf");
    expect(byLabel.get("Email")).toBe("mailto:ada@example.com");
    expect(byLabel.get("GitHub")).toBe("https://github.example/ada");
    expect(byLabel.get("Blog")).toBe("https://example.com/blog/");
    expect(byLabel.get("OpenAPI spec")).toBe("https://example.com/openapi.json");
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
      { category: "Languages", skills: ["TypeScript", "Python", "SQL"] },
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
    expect(buildDataset(input()).proficiencies).toEqual([
      { area: "Backend", tools: ["Node.js", "Nest.js"], level: 90 },
      { area: "Frontend", tools: ["React"], level: 80 }
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
        grade: "CGPA 9.53 / 10",
        highlights: ["Focus on distributed systems."]
      }
    ]);
  });

  it("leaves grade null when the school entry has none", () => {
    const base = input();
    const [school] = base.educationInfo;
    const { grade: _grade, ...withoutGrade } = school as typeof school & {
      grade?: string;
    };
    expect(buildDataset({ ...base, educationInfo: [withoutGrade] }).education[0].grade).toBeNull();
  });

  it("names the open-source project from the card title", () => {
    expect(buildDataset(input()).openSource).toEqual([
      {
        project: "AnkiDroid",
        role: "Open Source Contributor",
        description: "3 merged pull requests to AnkiDroid.",
        links: [{ label: "Image paste (#10320)", url: "https://gh.example/1" }]
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
    expect(parseDataset({ ...built, person: {} })).toBeNull();
  });

  it("rejects a document with a missing collection", () => {
    const { experience: _dropped, ...rest } = buildDataset(input());
    expect(parseDataset(rest)).toBeNull();
  });
});

describe("parsePostList", () => {
  const LLMS = `# Murugappan M — Full Stack Engineer

> Full-stack engineer.

## Machine-readable feeds
- [Blog RSS](https://murugappan.dev/blog/rss.xml)
- [Full blog content for LLMs](https://murugappan.dev/blog/llms-full.txt)

## Blog posts
- [Why SiteGPT's chat runs on PartyKit](https://murugappan.dev/blog/sitegpt-partykit-durable-objects/): How one-process-per-room replaces socket.io + Redis.
- [Coin Change Problem](https://murugappan.dev/blog/coin-change-problem/): Find minimum number of coins.
`;
  const slugs = ["sitegpt-partykit-durable-objects", "coin-change-problem"];

  it("reads only the blog posts section, skipping the feed links", () => {
    expect(parsePostList(LLMS)).toEqual([
      {
        slug: "sitegpt-partykit-durable-objects",
        title: "Why SiteGPT's chat runs on PartyKit",
        url: "https://murugappan.dev/blog/sitegpt-partykit-durable-objects/",
        description: "How one-process-per-room replaces socket.io + Redis."
      },
      {
        slug: "coin-change-problem",
        title: "Coin Change Problem",
        url: "https://murugappan.dev/blog/coin-change-problem/",
        description: "Find minimum number of coins."
      }
    ]);
  });

  it("falls back to scanning the whole document when the section heading is missing", () => {
    const withoutHeading = LLMS.replace("## Blog posts\n", "");
    expect(parsePostList(withoutHeading).map(p => p.slug)).toEqual(slugs);
  });

  it("stops at the next section heading", () => {
    const withTrailer = `${LLMS}\n## Something else\n- [Nope](https://murugappan.dev/blog/nope/): no.\n`;
    expect(parsePostList(withTrailer).map(p => p.slug)).toEqual(slugs);
  });

  it("tolerates a post line with no description", () => {
    const line = "## Blog posts\n- [Bare](https://murugappan.dev/blog/bare/)\n";
    expect(parsePostList(line)).toEqual([
      {
        slug: "bare",
        title: "Bare",
        url: "https://murugappan.dev/blog/bare/",
        description: ""
      }
    ]);
  });

  it("returns nothing for text with no post links", () => {
    expect(parsePostList("# Nothing here\n")).toEqual([]);
  });
});

describe("postMarkdownPath", () => {
  it("maps a slug to its built markdown rendition", () => {
    expect(postMarkdownPath("coin-change-problem")).toBe("/blog/coin-change-problem/index.md");
  });

  it.each(["../secrets", "Mixed_Case", ""])("rejects %j, which is not a kebab-case token", slug => {
    expect(postMarkdownPath(slug)).toBeNull();
  });
});

describe("parseContactRequest", () => {
  const valid = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer for a healthcare data platform."
  };
  const minimal = { email: valid.email, message: valid.message };

  it("accepts a complete request", () => {
    expect(parseContactRequest(valid)).toEqual({ ok: true, value: valid, dryRun: false });
  });

  it.each([
    ["only email and message", minimal],
    [
      "surrounding whitespace, trimmed",
      { email: `  ${valid.email}  `, message: `  ${valid.message}  ` }
    ],
    ["blank optional fields, dropped", { ...valid, name: "   ", company: "" }]
  ])("accepts %s", (_, raw) => {
    expect(parseContactRequest(raw)).toEqual({ ok: true, value: minimal, dryRun: false });
  });

  it("reports a dryRun request separately from the message itself", () => {
    expect(parseContactRequest({ ...valid, dryRun: true })).toEqual({
      ok: true,
      value: valid,
      dryRun: true
    });
  });

  it.each<[string, unknown, string[]]>([
    ["a non-boolean dryRun", { ...valid, dryRun: "yes" }, ["dryRun"]],
    ["a string body", "hello", ["body"]],
    ["a null body", null, ["body"]],
    ["an array body", [], ["body"]],
    ["a missing email", { message: valid.message }, ["email"]],
    ["an email with no @", { ...minimal, email: "not-an-email" }, ["email"]],
    ["an email with no TLD", { ...minimal, email: "a@b" }, ["email"]],
    ["a non-string email", { ...minimal, email: 42 }, ["email"]],
    ["a too-short message", { ...minimal, message: "hi" }, ["message"]],
    [
      "a too-long message",
      { ...minimal, message: "x".repeat(CONTACT_LIMITS.message.max + 1) },
      ["message"]
    ],
    ["an over-long name", { ...valid, name: "x".repeat(CONTACT_LIMITS.name + 1) }, ["name"]],
    [
      "an over-long company",
      { ...valid, company: "x".repeat(CONTACT_LIMITS.company + 1) },
      ["company"]
    ],
    ["a non-string name", { ...valid, name: 42 }, ["name"]],
    ["every invalid field at once", { email: "nope", message: "hi" }, ["email", "message"]]
  ])("rejects %s", (_, raw, fields) => {
    const result = parseContactRequest(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(i => i.field)).toEqual(fields);
  });
});
