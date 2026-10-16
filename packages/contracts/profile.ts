import { z } from "zod";

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
  links: z.array(z.strictObject({ label: z.string(), url: z.url() })).min(1)
});

export const Profile = z.strictObject({
  summary: z.string(),
  workExperiences: z.array(WorkExperience),
  skillsCategories: z.array(z.strictObject({ category: z.string(), items: z.string() })),
  educationInfo: z.array(Education),
  openSourceContributions: z.array(OpenSourceContribution)
});
