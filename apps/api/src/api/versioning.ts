import type { z } from "zod";

import {
  API_BASE,
  API_PATHS,
  CURRENT_API_VERSION,
  VERSIONED_API_BASE
} from "@murugappan/contracts/api/routes.ts";
import {
  API_VERSION,
  ApiVersions,
  CURRENT_VERSION_RECORD,
  DEPRECATION_NOTICE_DAYS,
  POLICY_RULES,
  VERSIONS,
  type VersionRecord
} from "@murugappan/contracts/api/versioning.ts";

/** URLs are absolute against the host that was asked. */
export function buildVersionsDocument(origin: string): z.infer<typeof ApiVersions> {
  return {
    current: CURRENT_API_VERSION,
    currentRelease: API_VERSION,
    unversionedAlias: {
      basePath: API_BASE,
      pinnedTo: CURRENT_API_VERSION,
      note: `${API_BASE}/... is a permanent alias for ${VERSIONED_API_BASE}/... and is never repointed at a later major version.`
    },
    versions: VERSIONS.map(record => ({
      ...record,
      url: `${origin}${record.basePath}`,
      specUrl: `${origin}${record.specUrl}`
    })),
    policy: {
      scheme: "url-path",
      deprecationNoticeDays: DEPRECATION_NOTICE_DAYS,
      rules: POLICY_RULES,
      documentationUrl: `${origin}/developers/#versioning`,
      headers: {
        "API-Version": "The semantic release that answered this request.",
        "API-Supported-Versions": "Every path version this deployment still answers.",
        Deprecation: "RFC 9745. Present only on a deprecated version; the date it was deprecated.",
        Sunset: "RFC 8594. Present only on a deprecated version; the date it stops answering.",
        Link: "RFC 8288 relations: version-history, latest-version, service-desc, service-doc, and deprecation plus successor-version once deprecated."
      }
    }
  };
}

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
