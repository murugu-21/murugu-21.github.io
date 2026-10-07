// The schema.org nodes every page shares.
import type { Graph, Person, Thing, WebPage, WebSite } from "schema-dts";
import { sameAs, skillsCategories, socialMediaLinks } from "#src/data/portfolio.ts";
import { AUTHOR, PERSON_ID, SITE_DESCRIPTION, SITE_ORIGIN, WEBSITE_ID } from "#src/lib/site.ts";

const HAND_WRITTEN_KNOWS_ABOUT = [
  "TypeScript",
  "Node.js",
  "React",
  "AWS",
  "Distributed systems",
  "Event-driven architecture",
  "Observability",
  "SOC 2",
  "HIPAA"
];

// The hand-written list plus the resume skills, split on ";", "—" and commas
// outside parentheses (keeps "(AWS SQS, EventBridge)" intact), deduped
// case-insensitively.
function knowsAbout(): string[] {
  const seen = new Set(HAND_WRITTEN_KNOWS_ABOUT.map(s => s.toLowerCase()));
  const extra: string[] = [];
  for (const { items } of skillsCategories) {
    for (const raw of items.split(/;|—|,(?![^()]*\))/)) {
      const term = raw.trim();
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      extra.push(term);
    }
  }
  return [...HAND_WRITTEN_KNOWS_ABOUT, ...extra];
}

const website: WebSite = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE_ORIGIN}/`,
  name: "Murugappan M, Full Stack Engineer",
  description: SITE_DESCRIPTION,
  publisher: { "@id": PERSON_ID },
  inLanguage: "en"
};

const person: Person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: AUTHOR.name,
  givenName: "Murugappan",
  // helps entity resolvers connect the sameAs profiles
  alternateName: ["murugu-21", "murugu21"],
  email: `mailto:${socialMediaLinks.gmail}`,
  address: {
    "@type": "PostalAddress",
    addressLocality: "Bangalore",
    addressCountry: "IN"
  },
  url: `${SITE_ORIGIN}/`,
  image: {
    "@type": "ImageObject",
    url: `${SITE_ORIGIN}/og-image.png`
  },
  jobTitle: "Full Stack Engineer",
  description: SITE_DESCRIPTION,
  worksFor: {
    "@type": "Organization",
    name: "MedMe Health",
    url: "https://www.medmehealth.com"
  },
  alumniOf: [
    {
      "@type": "Organization",
      name: "HyperVerge",
      url: "https://hyperverge.co"
    },
    {
      "@type": "Organization",
      name: "Samsung R&D Institute India",
      url: "https://research.samsung.com/sri-b"
    },
    {
      "@type": "CollegeOrUniversity",
      name: "Kumaraguru College of Technology",
      url: "https://kct.ac.in"
    }
  ],
  knowsAbout: knowsAbout(),
  sameAs,
  mainEntityOfPage: { "@id": `${SITE_ORIGIN}/about/` }
};

interface PageGraph {
  // null for noindex pages, which get no WebPage node.
  page: { url: string; name: string; about?: { "@id": string }; profilePage: boolean } | null;
  nodes: Thing[];
}

// The page's <script type="application/ld+json"> body: one @graph, so crawlers
// resolve every @id within the page.
export function jsonLdHtml({ page, nodes }: PageGraph): string {
  const graph: Thing[] = [website, person];
  if (page) {
    const webPage: WebPage = {
      "@type": page.profilePage ? "ProfilePage" : "WebPage",
      "@id": page.url,
      url: page.url,
      name: page.name,
      isPartOf: { "@id": WEBSITE_ID },
      about: page.about,
      ...(page.profilePage ? { mainEntity: { "@id": PERSON_ID } } : {}),
      inLanguage: "en"
    };
    graph.push(webPage);
  }
  graph.push(...nodes);
  // set:html doesn't escape, so a "</script>" in a post title would end the block.
  const jsonLd: Graph = { "@context": "https://schema.org", "@graph": graph };
  return JSON.stringify(jsonLd).replaceAll("<", "\\u003c");
}
