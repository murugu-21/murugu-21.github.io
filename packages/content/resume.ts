import { socialMediaLinks } from "./portfolio.ts";
import { SITE_ORIGIN } from "./site.ts";

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

export const displayUrl = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");
