// Production origin. The Worker keeps its own copies (it cannot import src/).
export const SITE_ORIGIN = "https://murugappan.dev";
// Stable JSON-LD @ids, so crawlers merge every page into one entity.
export const PERSON_ID = `${SITE_ORIGIN}/#person`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

// The one-paragraph pitch: og/twitter descriptions and the JSON-LD Person and WebSite.
export const SITE_DESCRIPTION =
  "I build B2B SaaS that ships in regulated industries, using TypeScript end-to-end and event-driven services on AWS. I was the founding engineer who took a product from 0 to $300k ARR, and now I automate pharmacy workflows with LLMs at MedMe Health.";

export const BLOG_TITLE = "SDE Journey";
export const BLOG_DESCRIPTION = "A Technical blog on my experiences in the tech industry";
export const BLOG_URL = `${SITE_ORIGIN}/blog`;
export const BLOG_ID = `${BLOG_URL}/#blog`;
export const AUTHOR = {
  name: "Murugappan M",
  summary: "Hard-won lessons from building software that runs in production"
};
