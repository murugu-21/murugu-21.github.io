import { sameAs, socialMediaLinks } from "../data/portfolio";
import { SITE_ORIGIN } from "../lib/site";

export const SITE_TITLE = "SDE Journey";
export const SITE_DESCRIPTION = "A Technical blog on my experiences in the tech industry";
export const SITE_URL = `${SITE_ORIGIN}/blog`;
export const AUTHOR = {
  name: "Murugappan M",
  summary: "Hard-won lessons from building software that actually runs in production"
};
export const SOCIAL = {
  // X handle for twitter:creator.
  twitter: new URL(socialMediaLinks.twitter).pathname.replace(/^\//, "")
};
// Same @id as src/layouts/Layout.astro so crawlers merge the blog author with
// the site-wide Person.
export const PERSON = {
  "@type": "Person",
  "@id": `${SITE_ORIGIN}/#person`,
  name: AUTHOR.name,
  url: `${SITE_ORIGIN}/about/`,
  sameAs
};
