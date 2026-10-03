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
import { DATASET_INPUT } from "./fixtures";

// The shared site fixture plus a finished role, a grade and a skill category
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
  const dataset = buildDataset(input);

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

  it("derives the current role from the open-ended experience entry", () => {
    expect(dataset.person.currentRole).toEqual({
      role: "Software Engineer II",
      company: "MedMe Health",
      since: "2025-12"
    });
  });

  it("reports no current role when every entry has ended", () => {
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
  });

  it("leaves grade null when the school entry has none", () => {
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

describe("parseDataset", () => {
  it("accepts a document produced by buildDataset", () => {
    const built = buildDataset(input);
    const roundTripped = parseDataset(JSON.parse(JSON.stringify(built)));
    expect(roundTripped).toEqual(built);
  });

  it("rejects a document with a missing collection", () => {
    const { experience: _dropped, ...rest } = buildDataset(input);
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
    ["a non-string name", { ...valid, name: 42 }, ["name"]]
  ])("rejects %s", (_, raw, fields) => {
    const result = parseContactRequest(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(i => i.field)).toEqual(fields);
  });
});
