// Resume content lives in profile.json; this file adds the site-only copy around it.
import { Profile } from "@murugappan/contracts/profile.ts";
import profileJson from "./profile.json";

const profile = Profile.parse(profileJson);
export const { workExperiences, skillsCategories, educationInfo, openSourceContributions } =
  profile;

export const greeting = {
  username: "Murugappan M",
  // short, candid form used only by the hero line ("I'm Muru")
  nickname: "Muru",
  subTitle: profile.summary,
  resumePath: "/resume.pdf",
  resumeFileName: "Murugappan-M-Resume.pdf"
};

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

export const currentEmployer = { name: "MedMe Health", url: "https://www.medmehealth.com" };

/** The about page's link row. Site paths are relative. */
export const aboutLinks = [
  { label: "GitHub", href: socialMediaLinks.github },
  { label: "LinkedIn", href: socialMediaLinks.linkedin },
  { label: "X / Twitter", href: socialMediaLinks.twitter },
  { label: "Blog", href: "/blog/" },
  { label: "Resume (PDF)", href: greeting.resumePath },
  { label: `Email: ${socialMediaLinks.gmail}`, href: `mailto:${socialMediaLinks.gmail}` }
];

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
    "⚡ Design distributed, event-driven systems on AWS with Kafka, SQS and CDC",
    "⚡ Ship with observability and security built in: OpenTelemetry, Grafana, SOC 2 & HIPAA compliance"
  ],
  // iconName is a <symbol id> in apps/site/src/assets/icons.svg
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
        { name: "Express.js", icon: "express" },
        { name: "Nest.js", icon: "nestjs" },
        { name: "Hono", icon: "hono" },
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
        { name: "Astro", icon: "astro" },
        { name: "TypeScript", icon: "typescript" }
      ],
      progressPercentage: "80%"
    },
    {
      stack: "Testing",
      tools: [
        { name: "Vitest", icon: "vitest" },
        { name: "Playwright", icon: "playwright" },
        { name: "k6", icon: "k6" }
      ],
      progressPercentage: "75%"
    }
  ]
};

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

export const blogSection = {
  title: "Blogs",
  subtitle:
    "I write about real-world software engineering: distributed systems, cloud architecture, and lessons from production.",
  // Follows the featured posts (packages/content/blog, `featured: true`).
  blogIndexCard: {
    url: "/blog/",
    title: "SDE Journey, my technical blog",
    description: "Hard-won lessons from building software that runs in production."
  }
};

export const contactInfo = {
  title: "Contact Me ☎️",
  subtitle: "Want to discuss a project, a role, or just say hi? My inbox is open.",
  emailAddress: socialMediaLinks.gmail
};

export const isHireable = true;
