import { API_BASE, API_PATHS } from "@murugappan/contracts/api/routes.ts";
import {
  CURRENT_VERSION_RECORD,
  VERSIONS,
  type VersionRecord
} from "@murugappan/contracts/api/versioning.ts";

/** RFC 9745: a Date structured field, i.e. `@` + a Unix timestamp in seconds. */
function deprecationFieldValue(isoDate: string): string {
  return `@${Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000)}`;
}

/** RFC 8594: an IMF-fixdate, the same format Retry-After and Date use. */
function sunsetFieldValue(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

export function versionHeaders(
  record: VersionRecord = CURRENT_VERSION_RECORD
): Record<string, string> {
  const headers: Record<string, string> = {
    "API-Version": record.release,
    "API-Supported-Versions": VERSIONS.filter(v => v.status !== "sunset")
      .map(v => v.version)
      .join(", ")
  };
  if (record.deprecatedOn) headers.Deprecation = deprecationFieldValue(record.deprecatedOn);
  if (record.sunsetOn) headers.Sunset = sunsetFieldValue(record.sunsetOn);
  return headers;
}

export function versionLinkHeader(record: VersionRecord = CURRENT_VERSION_RECORD): string {
  const links = [
    `<${API_PATHS.openapiRoot}>; rel="service-desc"; type="application/json"`,
    `</developers/>; rel="service-doc"; type="text/html"`,
    `<${API_PATHS.versions}>; rel="version-history"; type="application/json"`,
    `<${CURRENT_VERSION_RECORD.basePath}>; rel="latest-version"`,
    `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`
  ];
  if (record.deprecatedOn) {
    links.push(`</developers/#versioning>; rel="deprecation"; type="text/html"`);
    if (record.successor) links.push(`<${API_BASE}/${record.successor}>; rel="successor-version"`);
  }
  return links.join(", ");
}

/** Exposed via CORS so browser clients can read them. */
export const META_EXPOSED_HEADERS: readonly string[] = [
  "API-Version",
  "API-Supported-Versions",
  "Deprecation",
  "Sunset",
  "Link",
  "Allow"
];
