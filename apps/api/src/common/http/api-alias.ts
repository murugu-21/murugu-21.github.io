import { getPath } from "hono/utils/url";

import { API_BASE, VERSIONED_API_BASE } from "@murugappan/contracts/api/routes.ts";
import { VERSIONS } from "@murugappan/contracts/api/versioning.ts";

const isUnder = ({ path, base }: { path: string; base: string }) =>
  path === base || path.startsWith(`${base}/`);

export function routedPath(request: Request): string {
  const path = getPath(request);
  const isVersioned = VERSIONS.some(({ basePath }) => isUnder({ path, base: basePath }));
  if (!isUnder({ path, base: API_BASE }) || isVersioned) return path;
  return VERSIONED_API_BASE + path.slice(API_BASE.length);
}

export const requestedPath = (request: Request): string => getPath(request);
