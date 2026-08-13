import type {ImageMetadata} from "astro";

import medmeLogo from "../assets/images/medmeLogo.png";
import hypervergeLogo from "../assets/images/hypervergeLogo.png";
import samsungLogo from "../assets/images/samsungLogo.png";
import kumaraguruLogo from "../assets/images/kumaraguruLogo.png";

// Summary And Greeting Section

export const greeting = {
  username: "Murugappan M",
  title: "Hi all, I'm Murugappan",
  subTitle:
    "I build B2B SaaS that ships in regulated industries — TypeScript end-to-end, event-driven on AWS. Founding engineer who took a product from 0 to $300k ARR; now automating pharmacy workflows with LLMs at MedMe Health.",
  resumePath: "/resume.pdf"
};

// Roles looped by the hero typewriter (reference-look migration)

export const typewriterRoles = [
  "Full Stack Engineer",
  "TypeScript · Node.js · React",
  "Event-Driven Systems on AWS",
  "Tech Blogger"
];

// Social Media Links

export const socialMediaLinks = {
  github: "https://github.com/murugu-21",
  linkedin: "https://www.linkedin.com/in/murugappan-m-56920a192/",
  gmail: "murugu2001@gmail.com",
  stackoverflow: "https://stackoverflow.com/users/15790108/murugappan-m",
  twitter: "https://twitter.com/murugu21"
};

// Skills Section

export interface SoftwareSkill {
  skillName: string;
  iconName: string; // key into components/Icon.astro path map
}

export const skillsSection: {
  title: string;
  subTitle: string;
  skills: string[];
  softwareSkills: SoftwareSkill[];
} = {
  title: "What I do",
  subTitle:
    "FULL-STACK ENGINEER BUILDING CLOUD-NATIVE, EVENT-DRIVEN SYSTEMS END-TO-END",
  skills: [
    "⚡ Build TypeScript end-to-end — React frontends and event-driven Node.js / Nest.js services",
    "⚡ Design distributed, event-driven systems on AWS (Lambda, API Gateway, SQS, EventBridge)",
    "⚡ Ship with observability and security built in — OpenTelemetry, Grafana, SOC 2 & HIPAA compliance"
  ],
  softwareSkills: [
    {
      skillName: "TypeScript / JavaScript",
      iconName: "js"
    },
    {
      skillName: "reactjs",
      iconName: "react"
    },
    {
      skillName: "nodejs",
      iconName: "node"
    },
    {
      skillName: "python",
      iconName: "python"
    },
    {
      skillName: "aws",
      iconName: "aws"
    },
    {
      skillName: "docker",
      iconName: "docker"
    },
    {
      skillName: "sql-database",
      iconName: "database"
    },
    {
      skillName: "git",
      iconName: "git-alt"
    },
    {
      skillName: "linux / bash",
      iconName: "linux"
    },
    {
      skillName: "npm",
      iconName: "npm"
    }
  ]
};

// Top 3 proficient stacks/tech experience

export const techStack: {
  experience: {stack: string; progressPercentage: string}[];
} = {
  experience: [
    {
      stack: "Backend (Node.js, Nest.js, event-driven)",
      progressPercentage: "90%"
    },
    {
      stack: "Cloud & Infra (AWS, Terraform, Docker)",
      progressPercentage: "85%"
    },
    {
      stack: "Frontend (React, TypeScript)",
      progressPercentage: "80%"
    }
  ]
};

// Work experience section

export interface WorkExperience {
  role: string;
  company: string;
  companyLogo: ImageMetadata;
  location: string;
  date: string;
  desc: string;
  descBullets?: string[];
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
      "Led development of an LLM-based extractor that turns unstructured patient questionnaire answers into structured medication data — solving a long tail of edge cases to lift fax-to-entry accuracy from ~60-65% to 95%+.",
      "Drove HIPAA compliance: access-logged S3 buckets, PHI/PII scrubbing from logs, and server-side encryption of data at rest.",
      "Made every service debuggable from one Grafana view — vendor-agnostic OpenTelemetry traces and metrics across the platform."
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
      "Built the platform's backbone for all async and scheduled work — an event-driven job system on AWS SQS and EventBridge.",
      "Led the architecture for CRM integrations (Salesforce, HubSpot), automating data prefilling to streamline the client deal-closure pipeline.",
      "Mentored junior engineers and established standardized code-review protocols to raise code quality."
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
      "Architected an LLM-based pipeline that extracts metadata from signed contracts — a core driver of the product's value proposition.",
      "Cut contract-listing latency to under 5 seconds across 15,000+ records by restructuring responses and tuning queries.",
      "Spearheaded VAPT and static code analysis for SOC 2 compliance, hardening API Gateways and Auto Scaling Groups.",
      "Built an end-to-end testing pipeline in GitLab CI using Playwright and Docker to ensure stability before deployments.",
      "Designed and deployed a PDF-conversion microservice, benchmarking and operationalizing an open-source tool for production use.",
      "Built a config-driven UI for stamp-paper procurement, reducing the effort to add new Article codes to a single JSON change."
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
      "Built a Role-Based Access Control (RBAC) system — database schemas and APIs to manage resource access via user groups.",
      "Developed Google Drive and OneDrive integrations enabling seamless PDF ingestion for AI extraction workflows."
    ]
  },
  {
    role: "R&D Intern",
    company: "Samsung R&D Institute India",
    companyLogo: samsungLogo,
    location: "Bangalore",
    date: "December 2021 – August 2022",
    desc: "Applied machine learning to anomaly detection for security use cases.",
    descBullets: [
      "Built an unsupervised Isolation Forest model to detect anomalous user activity from IP, API URL, and MAC-address signals — applicable to fraud detection.",
      "Generated synthetic training datasets and deployed the inference endpoint with Python/Django on Heroku."
    ]
  }
];

// Resume-only skills taxonomy — categorized for the printed resume's SKILLS
// section (see src/data/resume.ts) and folded into Layout.astro's JSON-LD
// knowsAbout. The portfolio's own Skills section keeps its own curated list.

export const skillsCategories: {category: string; items: string}[] = [
  {category: "Languages", items: "TypeScript, Python, SQL, Bash, YAML"},
  {
    category: "Full Stack",
    items:
      "TypeScript end-to-end — React.js, Node.js, Nest.js, Express.js; event-driven architecture (AWS SQS, EventBridge), microservices, REST APIs"
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

// Education Section

export interface Education {
  schoolName: string;
  logo: ImageMetadata;
  subHeader: string;
  duration: string;
  desc: string;
  descBullets: string[];
}

export const educationInfo: Education[] = [
  {
    schoolName: "Kumaraguru College of Technology",
    logo: kumaraguruLogo,
    subHeader: "Bachelor of Engineering in Computer Science",
    duration: "June 2019 - April 2023",
    desc: "Coimbatore, India.",
    descBullets: [
      "Graduated with a focus on distributed systems, databases, and software engineering."
    ]
  }
];

// Projects Section — pinned GitHub repositories, fetched at build time.
// Set display:false to hide the section entirely. When display is true the
// section renders only if there are pinned repos to show (so pinning a repo on
// GitHub is what makes it appear in production).

export const projectsSection: {
  title: string;
  subtitle: string;
  display: boolean;
} = {
  title: "Projects 🛠️",
  subtitle: "A few things I've built — pinned from my GitHub.",
  display: true
};

// Open Source Contributions Section (formerly achievementSection)

export const openSourceSection: {title: string; subtitle: string} = {
  title: "Open Source Contributions 🌐",
  subtitle: "Code I've contributed to projects used by people around the world."
};

export const openSourceCard: {
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  footerLink: {name: string; url: string}[];
} = {
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

// Blogs Section

export const blogSection: {
  title: string;
  subtitle: string;
  blogs: {url: string; title: string; description: string}[];
} = {
  title: "Blogs",
  subtitle:
    "I write about real-world software engineering — distributed systems, cloud architecture, and lessons from production.",
  blogs: [
    {
      url: "https://murugappan.dev/blog/sitegpt-partykit-durable-objects/",
      title: "Why SiteGPT's chat runs on PartyKit, not socket.io + Redis",
      description:
        "How a one-process-per-room architecture replaces socket.io + Redis for realtime chat — with production code, cost math, and the actor-model tradeoffs, drawn from the chatbot running on this site."
    },
    {
      url: "https://murugappan.dev/blog/eventform-outbox-pipeline-claude/",
      title: "Forms in, webhooks out: an event-driven pipeline",
      description:
        "Building a multi-tenant form builder with a transactional outbox, Debezium CDC, idempotent webhook delivery, and OAuth handed off to Cognito — and what it taught me about event-driven design."
    },
    {
      url: "https://murugappan.dev/blog/cloud-agnostic-rate-limiting/",
      title: "Modern distributed rate limiting in the cloud",
      description:
        "A portable two-tier IP and per-user rate-limiting pattern that protects your compute budget as LLM agents make per-user limits essential — without locking you to one cloud."
    },
    {
      url: "https://murugappan.dev/blog/",
      title: "SDE Journey — my technical blog",
      description:
        "Hard-won lessons from building software that actually runs in production."
    }
  ]
};

// Contact Section

export const contactInfo = {
  title: "Contact Me ☎️",
  subtitle:
    "Want to discuss a project, a role, or just say hi? My inbox is open.",
  // No phone number is hardcoded in source — set RESUME_PHONE (build env /
  // local .env) to populate it. This value only ever renders in
  // GithubCard.astro's no-GitHub-profile fallback contact view (production
  // renders the profile branch instead, which never reads contactInfo.number
  // — see GithubCard.astro). The resume page (src/data/resume.ts) reads the
  // same env var independently for its contact line.
  number: import.meta.env.RESUME_PHONE ?? "",
  emailAddress: "murugu2001@gmail.com"
};

export const isHireable = true;
