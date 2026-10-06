import type { ImageMetadata } from "astro";
import { RESUME_PHONE } from "astro:env/server";

import medmeLogo from "#src/assets/images/medmeLogo.png";
import hypervergeLogo from "#src/assets/images/hypervergeLogo.png";
import samsungLogo from "#src/assets/images/samsungLogo.png";
import kumaraguruLogo from "#src/assets/images/kumaraguruLogo.png";

export const greeting = {
  username: "Murugappan M",
  // short, candid form used only by the hero line ("I'm Muru")
  nickname: "Muru",
  subTitle:
    "I build B2B SaaS that ships in regulated industries, using TypeScript end-to-end and event-driven services on AWS. I was the founding engineer who took a product from 0 to $300k ARR, and now I automate pharmacy workflows with LLMs at MedMe Health.",
  resumePath: "/resume.pdf",
  resumeFileName: "Murugappan-M-Resume.pdf"
};

// Roles looped by the hero typewriter
export const typewriterRoles = [
  "Full Stack Engineer",
  "TypeScript · Node.js · React",
  "Event-Driven Systems on AWS",
  "Tech Blogger"
];

export const socialMediaLinks = {
  github: "https://github.com/murugu-21",
  linkedin: "https://www.linkedin.com/in/murugappan-m-56920a192/",
  gmail: "murugu2001@gmail.com",
  twitter: "https://x.com/murugu21",
  rss: "https://murugappan.dev/blog/rss.xml"
};

// schema.org Person.sameAs.
export const sameAs = [
  socialMediaLinks.github,
  socialMediaLinks.linkedin,
  socialMediaLinks.twitter
];

export const skillsSection = {
  title: "What I do",
  subTitle: "FULL-STACK ENGINEER BUILDING CLOUD-NATIVE, EVENT-DRIVEN SYSTEMS END-TO-END",
  skills: [
    "⚡ Build TypeScript end-to-end: event-driven Node.js / Nest.js services and React frontends",
    "⚡ Design distributed, event-driven systems on AWS (Lambda, API Gateway, SQS, EventBridge)",
    "⚡ Ship with observability and security built in: OpenTelemetry, Grafana, SOC 2 & HIPAA compliance"
  ],
  // iconName is a <symbol id> in src/assets/icons.svg
  softwareSkills: [
    { skillName: "TypeScript", iconName: "typescript" },
    { skillName: "React", iconName: "react" },
    { skillName: "Node.js", iconName: "node" },
    { skillName: "Python", iconName: "python" },
    { skillName: "AWS", iconName: "aws" },
    { skillName: "Docker", iconName: "docker" },
    { skillName: "PostgreSQL", iconName: "postgresql" },
    { skillName: "SQLite", iconName: "sqlite" },
    { skillName: "Kafka", iconName: "kafka" },
    { skillName: "CDC (Debezium)", iconName: "cdc" },
    { skillName: "Playwright", iconName: "playwright" },
    { skillName: "k6", iconName: "k6" }
  ]
};

// progressPercentage feeds the dataset API's `level`; the site doesn't show it.
export const techStack = {
  experience: [
    {
      stack: "Backend",
      tools: [
        { name: "Node.js", icon: "node" },
        { name: "Nest.js", icon: "nestjs" },
        { name: "Event-driven", icon: "bolt" }
      ],
      progressPercentage: "90%"
    },
    {
      stack: "Distributed systems",
      tools: [
        { name: "Kafka", icon: "kafka" },
        { name: "SQS", icon: "sqs" },
        { name: "DynamoDB", icon: "dynamodb" },
        { name: "CDC", icon: "cdc" }
      ],
      progressPercentage: "85%"
    },
    {
      stack: "Cloud & Infra",
      tools: [
        { name: "AWS", icon: "aws" },
        { name: "Terraform", icon: "terraform" },
        { name: "Docker", icon: "docker" }
      ],
      progressPercentage: "85%"
    },
    {
      stack: "Frontend",
      tools: [
        { name: "React", icon: "react" },
        { name: "TypeScript", icon: "typescript" }
      ],
      progressPercentage: "80%"
    },
    {
      stack: "Testing",
      tools: [
        { name: "Playwright", icon: "playwright" },
        { name: "k6", icon: "k6" }
      ],
      progressPercentage: "75%"
    }
  ]
};

interface WorkExperience {
  role: string;
  company: string;
  companyLogo: ImageMetadata;
  location: string;
  date: string;
  desc: string;
  descBullets?: string[];
  /** Part-time roles are labelled and left out of the total experience. */
  partTime?: boolean;
}

export const workExperiences: WorkExperience[] = [
  {
    role: "Software Engineer II",
    company: "MedMe Health",
    companyLogo: medmeLogo,
    location: "Canada (remote)",
    date: "December 2025 – Present",
    desc: "Leading design of the event-driven RPA platform that automates pharmacy admin work at this YC-backed healthtech startup.",
    descBullets: [
      "Led development of an LLM-based extractor that turns unstructured patient questionnaire answers into structured medication data. Working through its long tail of edge cases lifted fax-to-entry accuracy from ~60-65% to 95%+.",
      "Drove HIPAA compliance: access-logged S3 buckets, PHI/PII scrubbing from logs, and server-side encryption of data at rest.",
      "Made every service debuggable from one Grafana view, with vendor-agnostic OpenTelemetry traces and metrics across the platform."
    ]
  },
  {
    role: "SDE 2",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
    location: "Bangalore",
    date: "April 2025 – December 2025",
    desc: "Owned core platform architecture for HyperStart, the company's contract lifecycle management (CLM) product.",
    descBullets: [
      "Cut infrastructure spend to a 10% MRR-to-server-cost ratio by profiling usage and reallocating resources over 3 months.",
      "Built the event-driven job system on AWS SQS and EventBridge that runs all of the platform's async and scheduled work.",
      "Led the architecture for CRM integrations (Salesforce, HubSpot) that prefill deal data to speed up the client deal-closure pipeline.",
      "Mentored junior engineers and introduced a standard code-review process to raise code quality."
    ]
  },
  {
    role: "SDE 1",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
    location: "Bangalore",
    date: "July 2023 – March 2025",
    desc: "Founding engineer on HyperStart CLM, owning features from design through to customer outcome as the product scaled to $300k ARR.",
    descBullets: [
      "Architected an LLM-based pipeline that extracts metadata from signed contracts, one of the product's main selling points.",
      "Cut contract-listing latency to under 5 seconds across 15,000+ records by restructuring responses and tuning queries.",
      "Led VAPT and static code analysis for SOC 2 compliance, hardening API Gateways and Auto Scaling Groups.",
      "Built an end-to-end testing pipeline in GitLab CI with Playwright and Docker that gates deployments.",
      "Benchmarked an open-source PDF converter, then designed and deployed it as a production microservice.",
      "Built a config-driven UI for stamp-paper procurement, so adding a new Article code is a single JSON change."
    ]
  },
  {
    role: "SDE Intern",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
    location: "Bangalore",
    date: "August 2022 – June 2023",
    desc: "Built core ingestion and access-control foundations for the CLM platform.",
    descBullets: [
      "Built a Role-Based Access Control (RBAC) system, with database schemas and APIs that manage resource access through user groups.",
      "Built Google Drive and OneDrive integrations that ingest PDFs for the AI extraction workflows."
    ]
  },
  {
    role: "R&D Intern",
    company: "Samsung R&D Institute India",
    companyLogo: samsungLogo,
    location: "Bangalore (remote)",
    date: "December 2021 – August 2022",
    partTime: true,
    desc: "Applied machine learning to anomaly detection for security use cases.",
    descBullets: [
      "Built an unsupervised Isolation Forest model that detects anomalous user activity from IP, API URL, and MAC-address signals, an approach that also applies to fraud detection.",
      "Generated synthetic training datasets and deployed the inference endpoint with Python/Django on Heroku."
    ]
  }
];

// Resume SKILLS taxonomy, also folded into Layout.astro's JSON-LD knowsAbout.
export const skillsCategories = [
  { category: "Languages", items: "TypeScript, Python, SQL, Bash, YAML" },
  {
    category: "Full Stack",
    items:
      "TypeScript end-to-end; React.js, Node.js, Nest.js, Express.js; event-driven architecture (AWS SQS, EventBridge), microservices, REST APIs"
  },
  {
    category: "Observability & Security",
    items:
      "OpenTelemetry, Grafana (LGTM stack), Playwright; SOC 2, VAPT, PHI/PII scrubbing, server-side encryption"
  },
  {
    category: "Cloud & Infra",
    items:
      "AWS (Lambda, API Gateway, EC2, S3, VPC, SQS, EventBridge), Terraform, Docker, GitLab CI/CD, GitHub Actions"
  }
];

interface Education {
  schoolName: string;
  logo: ImageMetadata;
  subHeader: string;
  duration: string;
  desc: string;
  /** Final grade as displayed, e.g. "CGPA 9.53 / 10". */
  grade?: string;
  descBullets: string[];
}

export const educationInfo: Education[] = [
  {
    schoolName: "Kumaraguru College of Technology",
    logo: kumaraguruLogo,
    subHeader: "Bachelor of Engineering in Computer Science",
    duration: "June 2019 - April 2023",
    desc: "Coimbatore, India.",
    grade: "CGPA 9.53 / 10",
    descBullets: [
      "Graduated with a focus on distributed systems, databases, and software engineering."
    ]
  }
];

// Pinned GitHub repos, fetched at build time; the section renders only when
// some exist.
export const projectsSection = {
  title: "Projects 🛠️",
  subtitle: "A few things I've built, pinned from my GitHub."
};

export const openSourceSection = {
  title: "Open Source Contributions 🌐",
  subtitle: "Code I've contributed to projects used by people around the world."
};

export const openSourceCard = {
  title: "AnkiDroid — Open Source Contributor",
  subtitle:
    "3 merged pull requests to AnkiDroid, the popular open-source spaced-repetition flashcard app for Android (11k+ GitHub stars, millions of installs). Contributions include clipboard image paste, a deprecation-API wrapper, and test-configuration improvements.",
  image: "https://avatars.githubusercontent.com/u/3320903?v=4",
  imageAlt: "AnkiDroid logo",
  footerLink: [
    {
      name: "Image paste (#10320)",
      url: "https://github.com/ankidroid/Anki-Android/pull/10320"
    },
    {
      name: "Deprecation API (#10617)",
      url: "https://github.com/ankidroid/Anki-Android/pull/10617"
    },
    {
      name: "Test config (#10288)",
      url: "https://github.com/ankidroid/Anki-Android/pull/10288"
    },
    {
      name: "All my PRs",
      url: "https://github.com/ankidroid/Anki-Android/pulls?q=is%3Apr+author%3Amurugu-21"
    }
  ]
};

export const blogSection = {
  title: "Blogs",
  subtitle:
    "I write about real-world software engineering: distributed systems, cloud architecture, and lessons from production.",
  blogs: [
    {
      url: "https://murugappan.dev/blog/sitegpt-partykit-durable-objects/",
      title: "Why SiteGPT's chat runs on PartyKit, not socket.io + Redis",
      description:
        "How a one-process-per-room architecture replaces socket.io + Redis for realtime chat, with production code, cost math and the actor-model tradeoffs from the chatbot running on this site."
    },
    {
      url: "https://murugappan.dev/blog/eventform-outbox-pipeline-claude/",
      title: "Forms in, webhooks out: an event-driven pipeline",
      description:
        "Building a multi-tenant form builder with a transactional outbox, Debezium CDC, idempotent webhook delivery and OAuth handed off to Cognito, and what it taught me about event-driven design."
    },
    {
      url: "https://murugappan.dev/blog/cloud-agnostic-rate-limiting/",
      title: "Modern distributed rate limiting in the cloud",
      description:
        "A portable two-tier IP and per-user rate-limiting pattern that protects your compute budget now that LLM agents make per-user limits essential, without locking you to one cloud."
    },
    {
      url: "https://murugappan.dev/blog/",
      title: "SDE Journey, my technical blog",
      description: "Hard-won lessons from building software that runs in production."
    }
  ]
};

export const contactInfo = {
  title: "Contact Me ☎️",
  subtitle: "Want to discuss a project, a role, or just say hi? My inbox is open.",
  // Never hardcoded: comes from RESUME_PHONE. Renders only in GithubCard's
  // no-profile fallback.
  number: RESUME_PHONE ?? "",
  emailAddress: socialMediaLinks.gmail
};

export const isHireable = true;
