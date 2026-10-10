// The resume content in packages/content/profile.json. The site, the resume PDF, the JSON API
// and llms.txt all read it, so an edit there reaches every one of them.

import { z } from "zod";

/** The image beside each employer and school; apps/site/src/data/logos.ts maps each key to its file. */
export const Logo = z.enum(["medme", "hyperverge", "samsung", "kumaraguru"]);
export type Logo = z.infer<typeof Logo>;

const WorkExperience = z.strictObject({
  role: z.string(),
  company: z.string(),
  companyLogo: Logo,
  location: z.string(),
  date: z.string(),
  desc: z.string(),
  descBullets: z.array(z.string()).optional(),
  /** Part-time roles are labelled and left out of the total experience. */
  partTime: z.boolean().optional()
});

const Education = z.strictObject({
  schoolName: z.string(),
  logo: Logo,
  subHeader: z.string(),
  duration: z.string(),
  desc: z.string(),
  grade: z.string().optional(),
  descBullets: z.array(z.string())
});

const OpenSourceContribution = z.strictObject({
  project: z.string(),
  role: z.string(),
  description: z.string(),
  image: z.url(),
  imageAlt: z.string(),
  /** The resume prints only the first link, so put the one that best backs the description first. */
  links: z.array(z.strictObject({ label: z.string(), url: z.url() })).min(1)
});

export const Profile = z.strictObject({
  /** The professional summary, also the homepage's hero line. */
  summary: z.string(),
  /** Newest first. */
  workExperiences: z.array(WorkExperience),
  /** The resume's SKILLS taxonomy, also folded into the JSON-LD knowsAbout (apps/site/src/lib/schema.ts). */
  skillsCategories: z.array(z.strictObject({ category: z.string(), items: z.string() })),
  educationInfo: z.array(Education),
  /** Newest first. */
  openSourceContributions: z.array(OpenSourceContribution)
});
