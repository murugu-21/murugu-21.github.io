import { RESUME_PHONE } from "astro:env/server";

import { SITE_ORIGIN } from "../lib/site";
import { socialMediaLinks } from "./portfolio";

// The phone number is never hardcoded: it comes from the RESUME_PHONE build
// env var, and the contact line omits it when unset.

interface ResumeContact {
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  site: string;
}

export const resumeContact: ResumeContact = {
  name: "Murugappan M",
  title: "Full Stack Engineer",
  location: "Bangalore, India",
  email: socialMediaLinks.gmail,
  phone: RESUME_PHONE ?? "",
  linkedin: socialMediaLinks.linkedin,
  github: socialMediaLinks.github,
  site: SITE_ORIGIN
};
