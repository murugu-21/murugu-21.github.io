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
    "Full-Stack Engineer with 3+ years building cloud-native B2B SaaS in regulated domains (LLM-powered CLM, healthcare) 🚀. TypeScript across the stack — from React frontends to event-driven Node.js services on AWS. Founding engineer on a product scaled to $300k ARR, with a strong focus on distributed systems, observability, and security/compliance (SOC 2, HIPAA).",
  resumePath: "/resume.pdf"
};

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
  fontAwesomeClassname: string;
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
      fontAwesomeClassname: "fab fa-js"
    },
    {
      skillName: "reactjs",
      fontAwesomeClassname: "fab fa-react"
    },
    {
      skillName: "nodejs",
      fontAwesomeClassname: "fab fa-node"
    },
    {
      skillName: "python",
      fontAwesomeClassname: "fab fa-python"
    },
    {
      skillName: "aws",
      fontAwesomeClassname: "fab fa-aws"
    },
    {
      skillName: "docker",
      fontAwesomeClassname: "fab fa-docker"
    },
    {
      skillName: "sql-database",
      fontAwesomeClassname: "fas fa-database"
    },
    {
      skillName: "git",
      fontAwesomeClassname: "fab fa-git-alt"
    },
    {
      skillName: "linux / bash",
      fontAwesomeClassname: "fab fa-linux"
    },
    {
      skillName: "npm",
      fontAwesomeClassname: "fab fa-npm"
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
  date: string;
  desc: string;
  descBullets?: string[];
}

export const workExperiences: WorkExperience[] = [
  {
    role: "Intermediate Software Engineer (L4.5)",
    company: "MedMe Health",
    companyLogo: medmeLogo,
    date: "December 2025 – Present",
    desc: "Leading the design of an event-driven RPA platform that automates pharmacy administrative workflows, for this Y Combinator-backed startup.",
    descBullets: [
      "Built vendor-agnostic observability across services with OpenTelemetry, shipping traces and metrics into the Grafana LGTM stack.",
      "Drove HIPAA compliance: access-logged S3 buckets, PHI/PII scrubbing from logs, and server-side encryption of data at rest.",
      "Led development of an LLM-based extractor that converts unstructured patient questionnaire answers into structured medication data."
    ]
  },
  {
    role: "SDE 2",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
    date: "April 2025 – December 2025",
    desc: "Owned core platform architecture for HyperStart, the company's contract lifecycle management (CLM) product.",
    descBullets: [
      "Designed a scalable, event-driven background-job system on AWS SQS and EventBridge — the foundation for cron and async task scheduling across the platform.",
      "Led the architecture for CRM integrations (Salesforce, HubSpot), automating data prefilling to streamline the client deal-closure pipeline.",
      "Cut infrastructure spend to a 10% MRR-to-server-cost ratio by profiling usage and reallocating resources over 3 months.",
      "Mentored junior engineers and established standardized code-review protocols to raise code quality."
    ]
  },
  {
    role: "SDE 1",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
    date: "July 2023 – March 2025",
    desc: "Founding engineer on HyperStart CLM, owning features from design through to customer outcome as the product scaled to $300k ARR.",
    descBullets: [
      "Optimized contract-listing APIs to respond in under 5 seconds across 15,000+ records by restructuring responses and tuning queries.",
      "Architected an LLM-based pipeline that extracts metadata from signed contracts — a core driver of the product's value proposition.",
      "Spearheaded VAPT and static code analysis for SOC 2 compliance, hardening API Gateways and Auto Scaling Groups.",
      "Built an end-to-end testing pipeline in GitLab CI using Playwright and Docker to ensure stability before deployments."
    ]
  },
  {
    role: "SDE Intern",
    company: "HyperVerge",
    companyLogo: hypervergeLogo,
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
    date: "December 2021 – August 2022",
    desc: "Applied machine learning to anomaly detection for security use cases.",
    descBullets: [
      "Built an unsupervised Isolation Forest model to detect anomalous user activity from IP, API URL, and MAC-address signals — applicable to fraud detection.",
      "Generated synthetic training datasets and deployed the inference endpoint with Python/Django on Heroku."
    ]
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
      url: "https://murugu-21.github.io/429-googleapis/",
      title: "Rate limiting API requests in Node.js",
      description:
        "How to query external APIs without hitting the 429 rate limit in single-threaded Node.js, using time-and-concurrency-aware throttling."
    },
    {
      url: "https://murugu-21.github.io/toolbox/",
      title: "The developer toolbox",
      description:
        "A guide to the tools and habits that helped me become a more effective software engineer."
    },
    {
      url: "https://murugu-21.github.io/",
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
    "Open to relocation & visa sponsorship. Want to discuss a project, a role, or just say hi? My inbox is open.",
  number: "+91-9095298712",
  emailAddress: "murugu2001@gmail.com"
};

export const isHireable = true;
