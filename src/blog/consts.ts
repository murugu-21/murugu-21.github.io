// Site metadata, ported from gatsby-config.js siteMetadata.
import { sameAs, socialMediaLinks } from "../data/portfolio";

export const SITE_TITLE = "SDE Journey";
export const SITE_DESCRIPTION = "A Technical blog on my experiences in the tech industry";
// Full public URL of the blog (origin + base path).
export const SITE_URL = "https://murugappan.dev/blog";
export const AUTHOR = {
  name: "Murugappan M",
  summary: "Hard-won lessons from building software that actually runs in production"
};
export const SOCIAL = {
  // X handle for twitter:creator, taken from the one profile URL in portfolio.ts.
  twitter: new URL(socialMediaLinks.twitter).pathname.replace(/^\//, "")
};
// Canonical schema.org identity — same @id the portfolio app publishes
// (src/layouts/Layout.astro), so crawlers merge the blog's author with the
// site-wide Person entity. /about is the canonical entity page.
export const PERSON = {
  "@type": "Person",
  "@id": "https://murugappan.dev/#person",
  name: AUTHOR.name,
  url: "https://murugappan.dev/about/",
  sameAs
};
