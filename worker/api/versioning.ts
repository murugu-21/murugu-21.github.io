// The API's versioning and deprecation contract, in one place: the version
// catalogue, the promises made about it, and the response headers that carry
// both. An agent should never have to guess whether a surface can change under
// it, so the policy is served as data (GET /api/versions) as well as prose.
//
// Standards used, exactly as published:
//   * URL path versioning — /api/v1/... is the versioned surface.
//   * RFC 9745 `Deprecation`  — an @-prefixed Date structured field.
//   * RFC 8594  `Sunset`      — an HTTP-date.
//   * RFC 8288  Link relations `deprecation`, `successor-version`,
//     `version-history`, `latest-version`, `service-desc`, `service-doc`.

import {
  API_PATHS,
  API_BASE,
  CURRENT_API_VERSION,
  VERSIONED_API_BASE
} from "./routes";

/** Release of the current version, and the value of the `API-Version` header. */
export const API_VERSION = "1.0.0";

/** Minimum notice between a version being marked deprecated and its sunset. */
export const DEPRECATION_NOTICE_DAYS = 180;

export type VersionStatus = "current" | "deprecated" | "sunset";

export type VersionRecord = {
  /** Path segment that selects this version. */
  version: string;
  status: VersionStatus;
  /** Semantic release served by this version right now. */
  release: string;
  basePath: string;
  specUrl: string;
  /** ISO 8601 date the version was first published. */
  releasedOn: string;
  /** ISO 8601 date it was marked deprecated, or null while it is current. */
  deprecatedOn: string | null;
  /** ISO 8601 date it stops answering, or null while it is current. */
  sunsetOn: string | null;
  /** The version to move to, or null when this is the newest. */
  successor: string | null;
};

/**
 * Every version this deployment knows about, newest first. Adding a version
 * means adding a record here; the response headers, the `/api/versions`
 * document and the OpenAPI description all read from it.
 */
export const VERSIONS: readonly VersionRecord[] = [
  {
    version: CURRENT_API_VERSION,
    status: "current",
    release: API_VERSION,
    basePath: VERSIONED_API_BASE,
    specUrl: "/openapi.json",
    releasedOn: "2026-08-25",
    deprecatedOn: null,
    sunsetOn: null,
    successor: null
  }
];

export const CURRENT_VERSION_RECORD = VERSIONS[0];

export const POLICY_RULES: readonly string[] = [
  `The version is a path segment: every endpoint lives under ${VERSIONED_API_BASE}. There is no version header and no version query parameter — the URL is the version.`,
  `The unversioned ${API_BASE}/... prefix is a permanent alias for ${CURRENT_API_VERSION} and will never be repointed at a later major version. Code against either; both keep answering ${CURRENT_API_VERSION} for as long as ${CURRENT_API_VERSION} exists.`,
  "Additive changes ship inside a version without notice: new endpoints, new optional request fields, new response fields. Ignore fields you do not know rather than rejecting them.",
  "Breaking changes never ship inside a version. Removing or renaming a field or endpoint, changing a field's type, narrowing an enum, or changing what a status code means all require a new path version.",
  `A deprecated version answers every request with a Deprecation header (RFC 9745), a Sunset header (RFC 8594), and Link relations of deprecation and successor-version. At least ${DEPRECATION_NOTICE_DAYS} days pass between the first Deprecation header and the Sunset date.`,
  `Every response carries API-Version (the release being served) and API-Supported-Versions. ${API_PATHS.versions} is the machine-readable form of this policy and is also reachable at ${API_BASE}/versions.`,
  "After sunset a version answers 410 Gone with the standard error envelope, pointing at its successor. Paths are never silently reused."
];

export type VersionsDocument = {
  current: string;
  currentRelease: string;
  unversionedAlias: {basePath: string; pinnedTo: string; note: string};
  versions: Array<VersionRecord & {url: string}>;
  policy: {
    scheme: string;
    deprecationNoticeDays: number;
    rules: readonly string[];
    documentationUrl: string;
    headers: Record<string, string>;
  };
};

/** The body of GET /api/versions, absolute against the host that was asked. */
export function buildVersionsDocument(origin: string): VersionsDocument {
  const base = origin.replace(/\/$/, "");
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
      url: `${base}${record.basePath}`,
      specUrl: `${base}${record.specUrl}`
    })),
    policy: {
      scheme: "url-path",
      deprecationNoticeDays: DEPRECATION_NOTICE_DAYS,
      rules: POLICY_RULES,
      documentationUrl: `${base}/developers/#versioning`,
      headers: {
        "API-Version": "The semantic release that answered this request.",
        "API-Supported-Versions":
          "Every path version this deployment still answers.",
        Deprecation:
          "RFC 9745. Present only on a deprecated version; the date it was deprecated.",
        Sunset:
          "RFC 8594. Present only on a deprecated version; the date it stops answering.",
        Link: "RFC 8288 relations: version-history, latest-version, service-desc, service-doc, and deprecation plus successor-version once deprecated."
      }
    }
  };
}

/** RFC 9745: a Date structured field, i.e. `@` + a Unix timestamp in seconds. */
export function deprecationFieldValue(isoDate: string): string {
  return `@${Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 1000)}`;
}

/** RFC 8594: an IMF-fixdate, the same format Retry-After and Date use. */
export function sunsetFieldValue(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

/**
 * The version headers for a response served by `record`. Deprecation and
 * Sunset appear only once the record carries the dates, so a current version
 * never claims a lifetime it has not been given.
 */
export function versionHeaders(
  record: VersionRecord = CURRENT_VERSION_RECORD
): Record<string, string> {
  const headers: Record<string, string> = {
    "API-Version": record.release,
    "API-Supported-Versions": VERSIONS.filter(v => v.status !== "sunset")
      .map(v => v.version)
      .join(", ")
  };
  if (record.deprecatedOn)
    headers.Deprecation = deprecationFieldValue(record.deprecatedOn);
  if (record.sunsetOn) headers.Sunset = sunsetFieldValue(record.sunsetOn);
  return headers;
}

/**
 * The `Link` field for an API response: where the description, the docs and
 * the version history are, plus the migration pointers a deprecated version
 * owes its callers.
 */
export function versionLinkHeader(
  record: VersionRecord = CURRENT_VERSION_RECORD
): string {
  const links = [
    `<${API_PATHS.openapiRoot}>; rel="service-desc"; type="application/json"`,
    `<https://murugappan.dev/developers/>; rel="service-doc"; type="text/html"`,
    `<${API_PATHS.versions}>; rel="version-history"; type="application/json"`,
    `<${CURRENT_VERSION_RECORD.basePath}>; rel="latest-version"`,
    `</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`
  ];
  if (record.deprecatedOn) {
    links.push(
      `<https://murugappan.dev/developers/#versioning>; rel="deprecation"; type="text/html"`
    );
    if (record.successor)
      links.push(`<${API_BASE}/${record.successor}>; rel="successor-version"`);
  }
  return links.join(", ");
}

/** Version and discovery headers a browser client must be able to read. */
export const META_EXPOSED_HEADERS: readonly string[] = [
  "API-Version",
  "API-Supported-Versions",
  "Deprecation",
  "Sunset",
  "Link",
  "Allow"
];
