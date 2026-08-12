import {socialMediaLinks} from "./portfolio";

// Resume-only contact block. The phone number is never hardcoded — it comes
// from the RESUME_PHONE build-time env var (set in Cloudflare build env and,
// optionally, a local .env for previewing the resume page). When unset the
// contact line simply omits the phone segment.

export interface ResumeContact {
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
  email: "murugu2001@gmail.com",
  phone: import.meta.env.RESUME_PHONE ?? "",
  linkedin: socialMediaLinks.linkedin,
  github: socialMediaLinks.github,
  site: "https://murugappan.dev"
};
