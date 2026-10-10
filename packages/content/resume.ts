import { socialMediaLinks } from "./portfolio.ts";
import { SITE_ORIGIN } from "./site.ts";

// No phone number in source: the pages that show one read RESUME_PHONE from astro:env.
interface ResumeContact {
  name: string;
  title: string;
  location: string;
  email: string;
  linkedin: string;
  github: string;
  site: string;
}

export const resumeContact: ResumeContact = {
  name: "Murugappan M",
  title: "Full Stack Engineer",
  location: "Bangalore, India",
  email: socialMediaLinks.gmail,
  linkedin: socialMediaLinks.linkedin,
  github: socialMediaLinks.github,
  site: SITE_ORIGIN
};

/** A URL as the resume prints it, without the scheme or a trailing slash. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
