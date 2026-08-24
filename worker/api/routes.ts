// Single source of truth for the API's surface. The router (api/index.ts) uses
// it to tell "wrong method" apart from "no such endpoint", and the OpenAPI
// document (api/openapi.ts) is checked against it — so the published spec and
// the served routes cannot drift.

export const API_PATHS = {
  profile: "/api/profile",
  experience: "/api/experience",
  skills: "/api/skills",
  education: "/api/education",
  openSource: "/api/open-source",
  posts: "/api/posts",
  post: "/api/posts/{slug}",
  contact: "/api/contact",
  openapi: "/api/openapi.json",
  // Canonical spec location: agents look for /openapi.json at the site root,
  // so it is served there as well as under /api. Not listed in the spec's own
  // `paths` — it is the document, not an endpoint of it.
  openapiRoot: "/openapi.json"
} as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];

export const ALLOWED_METHODS: Record<string, readonly string[]> = {
  [API_PATHS.profile]: ["GET"],
  [API_PATHS.experience]: ["GET"],
  [API_PATHS.skills]: ["GET"],
  [API_PATHS.education]: ["GET"],
  [API_PATHS.openSource]: ["GET"],
  [API_PATHS.posts]: ["GET"],
  [API_PATHS.post]: ["GET"],
  [API_PATHS.contact]: ["POST"],
  [API_PATHS.openapi]: ["GET"],
  [API_PATHS.openapiRoot]: ["GET"]
};

// Paths the OpenAPI document describes as operations.
export const SPEC_PATHS: readonly string[] = [
  API_PATHS.profile,
  API_PATHS.experience,
  API_PATHS.skills,
  API_PATHS.education,
  API_PATHS.openSource,
  API_PATHS.posts,
  API_PATHS.post,
  API_PATHS.contact,
  API_PATHS.openapi
];

const LITERAL_PATHS = Object.values(API_PATHS).filter(p => !p.includes("{"));
const POST_PATH = /^\/api\/posts\/[^/]+$/;

/** The templated path a request URL maps to, or null when nothing serves it. */
export function matchApiPath(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if ((LITERAL_PATHS as string[]).includes(path)) return path;
  if (POST_PATH.test(path)) return API_PATHS.post;
  return null;
}
