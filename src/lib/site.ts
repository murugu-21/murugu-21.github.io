// Production origin. The Worker keeps its own copies (it cannot import src/).
export const SITE_ORIGIN = "https://murugappan.dev";
// Stable JSON-LD @ids, so crawlers merge every page into one entity.
export const PERSON_ID = `${SITE_ORIGIN}/#person`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

export const BLOG_TITLE = "SDE Journey";
export const BLOG_DESCRIPTION = "A Technical blog on my experiences in the tech industry";
export const BLOG_URL = `${SITE_ORIGIN}/blog`;
export const AUTHOR = {
  name: "Murugappan M",
  summary: "Hard-won lessons from building software that runs in production"
};
