import { developersSection, linkHeader, linkValue } from "@murugappan/content/surface.ts";
import { API_BASE } from "@murugappan/contracts/api/routes.ts";
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

type VersionHeaders = {
  "API-Version": string;
  "API-Supported-Versions": string;
  Deprecation?: string;
  Sunset?: string;
};

export function versionHeaders(record: VersionRecord = CURRENT_VERSION_RECORD): VersionHeaders {
  const headers: VersionHeaders = {
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
  const links = [linkHeader("api")];
  if (record.deprecatedOn) {
    links.push(linkValue({ ...developersSection("versioning"), rel: "deprecation" }));
    if (record.successor) {
      links.push(linkValue({ path: `${API_BASE}/${record.successor}`, rel: "successor-version" }));
    }
  }
  return links.join(", ");
}

export const META_EXPOSED_HEADERS: readonly string[] = [
  "API-Version",
  "API-Supported-Versions",
  "Deprecation",
  "Sunset",
  "Link",
  "Allow"
];
