// The API's paths. Unversioned `/api/...` is a permanent alias for v1.

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
