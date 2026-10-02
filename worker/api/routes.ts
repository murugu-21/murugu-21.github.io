// The API's surface: the router uses it to tell 405 from 404, and the OpenAPI document is tested
// against it. Unversioned `/api/...` is a permanent alias for v1, so paths are normalised first.

export const CURRENT_API_VERSION = "v1";

export const API_BASE = "/api";
export const VERSIONED_API_BASE = `${API_BASE}/${CURRENT_API_VERSION}`;

export const API_PATHS = {
  profile: `${VERSIONED_API_BASE}/profile`,
  experience: `${VERSIONED_API_BASE}/experience`,
  skills: `${VERSIONED_API_BASE}/skills`,
  education: `${VERSIONED_API_BASE}/education`,
  openSource: `${VERSIONED_API_BASE}/open-source`,
  posts: `${VERSIONED_API_BASE}/posts`,
  post: `${VERSIONED_API_BASE}/posts/{slug}`,
  contact: `${VERSIONED_API_BASE}/contact`,
  // Every version serves the same catalogue of all versions.
  versions: `${VERSIONED_API_BASE}/versions`,
  openapi: `${VERSIONED_API_BASE}/openapi.json`,
  // Agents probe the site root for the spec. Not in the spec's own `paths`.
  openapiRoot: "/openapi.json"
} as const;

export const READ_METHODS = ["GET", "HEAD"];

export const ALLOWED_METHODS: Record<string, readonly string[]> = {
  [API_PATHS.profile]: ["GET"],
  [API_PATHS.experience]: ["GET"],
  [API_PATHS.skills]: ["GET"],
  [API_PATHS.education]: ["GET"],
  [API_PATHS.openSource]: ["GET"],
  [API_PATHS.posts]: ["GET"],
  [API_PATHS.post]: ["GET"],
  [API_PATHS.contact]: ["POST"],
  [API_PATHS.versions]: ["GET"],
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
  API_PATHS.versions,
  API_PATHS.openapi
];

const LITERAL_PATHS = Object.values(API_PATHS).filter(p => !p.includes("{"));
const POST_PATH = new RegExp(`^${VERSIONED_API_BASE}/posts/[^/]+$`);

/** Rewrites the unversioned alias onto `/api/v1`. Bare `/api` names no endpoint, so it is kept. */
export function toVersionedPath(pathname: string): string {
  if (
    pathname === API_BASE ||
    pathname === VERSIONED_API_BASE ||
    pathname.startsWith(`${VERSIONED_API_BASE}/`)
  )
    return pathname;
  if (pathname.startsWith(`${API_BASE}/`))
    return `${VERSIONED_API_BASE}${pathname.slice(API_BASE.length)}`;
  return pathname;
}

/** The templated path a request URL maps to, or null when nothing serves it. */
export function matchApiPath(pathname: string): string | null {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const path = toVersionedPath(trimmed);
  if ((LITERAL_PATHS as string[]).includes(path)) return path;
  if (POST_PATH.test(path)) return API_PATHS.post;
  return null;
}
