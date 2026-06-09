/* Change this file to get your personal Portfolio */

// To change portfolio colors globally go to the  _globalColor.scss file

import emoji from "react-easy-emoji";
import splashAnimation from "./assets/lottie/splashAnimation"; // Rename to your file name for custom animation

// Splash Screen

const splashScreen = {
  enabled: true, // set false to disable splash screen
  animation: splashAnimation,
  duration: 2000 // Set animation duration as per your animation
};

// Summary And Greeting Section

const illustration = {
  animated: true // Set to false to use static SVG
};

const greeting = {
  username: "Murugappan M",
  title: "Hi all, I'm Murugappan",
  subTitle: emoji(
    "Full-Stack Engineer with 3+ years building cloud-native B2B SaaS in regulated domains (LLM-powered CLM, healthcare) 🚀. TypeScript across the stack — from React frontends to event-driven Node.js services on AWS. Founding engineer on a product scaled to $300k ARR, with a strong focus on distributed systems, observability, and security/compliance (SOC 2, HIPAA)."
  ),
  resumeLink: "https://murugu-21.github.io/", // Set to empty to hide the button (actual file is greeting/resume.pdf)
  displayGreeting: true // Set false to hide this section, defaults to true
};

// Social Media Links

const socialMediaLinks = {
  github: "https://github.com/murugu-21",
  linkedin: "https://www.linkedin.com/in/murugappan-m-56920a192/",
  gmail: "murugu2001@gmail.com",
  stackoverflow: "https://stackoverflow.com/users/15790108/murugappan-m",
  twitter: "https://twitter.com/murugu21",
  // Instagram, Twitter and Kaggle are also supported in the links!
  // To customize icons and social links, tweak src/components/SocialMedia
  display: true // Set true to display this section, defaults to false
};

// Skills Section

const skillsSection = {
  title: "What I do",
  subTitle:
    "FULL-STACK ENGINEER BUILDING CLOUD-NATIVE, EVENT-DRIVEN SYSTEMS END-TO-END",
  skills: [
    emoji(
      "⚡ Build TypeScript end-to-end — React frontends and event-driven Node.js / Nest.js services"
    ),
    emoji(
      "⚡ Design distributed, event-driven systems on AWS (Lambda, API Gateway, SQS, EventBridge)"
    ),
    emoji(
      "⚡ Ship with observability and security built in — OpenTelemetry, Grafana, SOC 2 & HIPAA compliance"
    )
  ],

  /* Make Sure to include correct Font Awesome Classname to view your icon
https://fontawesome.com/icons?d=gallery */

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
  ],
  display: true // Set false to hide this section, defaults to true
};

// Education Section

const educationInfo = {
  display: true, // Set false to hide this section, defaults to true
  schools: [
    {
      schoolName: "Kumaraguru College of Technology",
      logo: require("./assets/images/kumaraguruLogo.png"),
      subHeader: "Bachelor of Engineering in Computer Science",
      duration: "June 2019 - April 2023",
      desc: "Coimbatore, India.",
      descBullets: [
        "Graduated with a focus on distributed systems, databases, and software engineering."
      ]
    }
  ]
};

// Your top 3 proficient stacks/tech experience

const techStack = {
  viewSkillBars: true, //Set it to true to show Proficiency Section
  experience: [
    {
      Stack: "Backend (Node.js, Nest.js, event-driven)", //Insert stack or technology you have experience in
      progressPercentage: "90%" //Insert relative proficiency in percentage
    },
    {
      Stack: "Cloud & Infra (AWS, Terraform, Docker)",
      progressPercentage: "85%"
    },
    {
      Stack: "Frontend (React, TypeScript)",
      progressPercentage: "80%"
    }
  ],
  displayCodersrank: false // Set true to display codersrank badges section need to changes your username in src/containers/skillProgress/skillProgress.js:17:62, defaults to false
};

// Work experience section

const workExperiences = {
  display: true, //Set it to true to show workExperiences Section
  experience: [
    {
      role: "Intermediate Software Engineer (L4.5)",
      company: "MedMe Health",
      companylogo: require("./assets/images/medmeLogo.png"),
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
      companylogo: require("./assets/images/hypervergeLogo.png"),
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
      companylogo: require("./assets/images/hypervergeLogo.png"),
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
      companylogo: require("./assets/images/hypervergeLogo.png"),
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
      companylogo: require("./assets/images/samsungLogo.png"),
      date: "December 2021 – August 2022",
      desc: "Applied machine learning to anomaly detection for security use cases.",
      descBullets: [
        "Built an unsupervised Isolation Forest model to detect anomalous user activity from IP, API URL, and MAC-address signals — applicable to fraud detection.",
        "Generated synthetic training datasets and deployed the inference endpoint with Python/Django on Heroku."
      ]
    }
  ]
};

/* Your Open Source Section to View Your Github Pinned Projects
To know how to get github key look at readme.md */

const openSource = {
  showGithubProfile: "true", // Set true or false to show Contact profile using Github, defaults to true
  display: false // Hidden: no pinned repos yet. Pin repos on GitHub + set true to show.
};

// Some big projects you have worked on

const bigProjects = {
  title: "Big Projects",
  subtitle: "SOME STARTUPS AND COMPANIES THAT I HELPED TO CREATE THEIR TECH",
  projects: [],
  display: false // Set false to hide this section, defaults to true
};

// Achievement Section
// Include certificates, talks etc

const achievementSection = {
  title: emoji("Open Source Contributions 🌐"),
  subtitle:
    "Code I've contributed to projects used by people around the world.",

  achievementsCards: [
    {
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
    }
  ],
  display: true // Set false to hide this section, defaults to true
};

// Blogs Section

const blogSection = {
  title: "Blogs",
  subtitle:
    "I write about real-world software engineering — distributed systems, cloud architecture, and lessons from production.",
  displayMediumBlogs: "false", // Set true to display fetched medium blogs instead of hardcoded ones
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
  ],
  display: true // Set false to hide this section, defaults to true
};

// Talks Sections

const talkSection = {
  title: "TALKS",
  subtitle: emoji(
    "I LOVE TO SHARE MY LIMITED KNOWLEDGE AND GET A SPEAKER BADGE 😅"
  ),

  talks: [],
  display: false // Set false to hide this section, defaults to true
};

// Podcast Section

const podcastSection = {
  title: emoji("Podcast 🎙️"),
  subtitle: "I LOVE TO TALK ABOUT MYSELF AND TECHNOLOGY",

  // Please Provide with Your Podcast embeded Link
  podcast: [],
  display: false // Set false to hide this section, defaults to true
};

// Resume Section
const resumeSection = {
  title: "Resume",
  subtitle: "Feel free to download my resume",

  // Please Provide with Your Podcast embeded Link
  display: true // Set false to hide this section, defaults to true
};

const contactInfo = {
  title: emoji("Contact Me ☎️"),
  subtitle:
    "Open to relocation & visa sponsorship. Want to discuss a project, a role, or just say hi? My inbox is open.",
  number: "+91-9095298712",
  email_address: "murugu2001@gmail.com"
};

// Twitter Section

const twitterDetails = {
  userName: "murugu21", //Replace "twitter" with your twitter username without @
  display: false // Set true to display this section, defaults to false
};

const isHireable = true; // Set false if you are not looking for a job. Also isHireable will be display as Open for opportunities: Yes/No in the GitHub footer

export {
  illustration,
  greeting,
  socialMediaLinks,
  splashScreen,
  skillsSection,
  educationInfo,
  techStack,
  workExperiences,
  openSource,
  bigProjects,
  achievementSection,
  blogSection,
  talkSection,
  podcastSection,
  contactInfo,
  twitterDetails,
  isHireable,
  resumeSection
};
