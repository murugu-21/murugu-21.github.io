// Single source of truth for the API's surface. The router (api/index.ts) uses
// it to tell "wrong method" apart from "no such endpoint", and the OpenAPI
// document (api/openapi.ts) is checked against it — so the published spec and
// the served routes cannot drift.
//
// Paths are published in their explicitly versioned form (`/api/v1/...`). The
// unversioned `/api/...` prefix is a permanent alias for v1 — see
// api/versioning.ts for the policy that promise is part of — so a request path
// is normalised onto the versioned template before anything is matched.

/** The version segment in the URL path of the current API version. */
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
  // Version and deprecation metadata. Reachable unversioned as
  // /api/versions too, which is how a client that knows no version yet finds
  // one; every version serves the same catalogue of all versions.
  versions: `${VERSIONED_API_BASE}/versions`,
  openapi: `${VERSIONED_API_BASE}/openapi.json`,
  // Canonical spec location: agents look for /openapi.json at the site root,
  // so it is served there as well as under the API prefix. Not listed in the
  // spec's own `paths` — it is the document, not an endpoint of it.
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

/**
 * The versioned form of a request path. `/api/profile` and `/api/v1/profile`
 * are the same endpoint, so the unversioned alias is rewritten onto the
 * versioned template the spec documents. Bare `/api` is left alone: it names
 * no version and no endpoint.
 */
export function toVersionedPath(pathname: string): string {
  if (pathname === API_BASE) return pathname;
  if (pathname.startsWith(`${VERSIONED_API_BASE}/`)) return pathname;
  if (pathname === VERSIONED_API_BASE) return pathname;
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
