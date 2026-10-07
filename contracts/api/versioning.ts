// Version catalogue and deprecation policy; worker/api/versioning.ts sends the headers. Standards: URL path
// versioning, RFC 9745 `Deprecation`, RFC 8594 `Sunset`, RFC 8288 Link relations.

import { z } from "zod";

import { nullableText, text } from "./fields";
import { API_PATHS, API_BASE, CURRENT_API_VERSION, VERSIONED_API_BASE } from "./routes";

/** Also the value of the `API-Version` header. */
export const API_VERSION = "1.0.0";

/** Minimum notice between a version being marked deprecated and its sunset. */
export const DEPRECATION_NOTICE_DAYS = 180;

const nullableDate = (description: string) => nullableText(description, { format: "date" });

export const ApiVersionRecord = z
  .object({
    version: text("The path segment that selects this version.", {
      examples: [CURRENT_API_VERSION]
    }),
    status: z.enum(["current", "deprecated", "sunset"]).meta({
      description:
        "`current` while it is the newest, `deprecated` once a successor exists and a sunset date is set, `sunset` once it stops answering."
    }),
    release: text(
      "The semantic release this version serves right now. The `API-Version` response header carries the same value.",
      { examples: [API_VERSION] }
    ),
    basePath: text("Path prefix every endpoint of this version has.", {
      examples: [VERSIONED_API_BASE]
    }),
    url: text("Absolute base URL of this version.", { format: "uri" }),
    specUrl: text("Absolute URL of this version's OpenAPI document.", { format: "uri" }),
    releasedOn: text("ISO 8601 date the version was published.", { format: "date" }),
    deprecatedOn: nullableDate(
      "ISO 8601 date the version was marked deprecated, or null while it is current. Mirrors the `Deprecation` response header."
    ),
    sunsetOn: nullableDate(
      "ISO 8601 date the version stops answering, or null while it is current. Mirrors the `Sunset` response header."
    ),
    successor: nullableText("The version to migrate to, or null when this is the newest.")
  })
  .meta({
    title: "ApiVersionRecord",
    description: "One version of this API and where it is in its lifecycle."
  });

/** A catalogue entry before its URLs are made absolute; `specUrl` is site-relative here. */
export type VersionRecord = Omit<z.infer<typeof ApiVersionRecord>, "url">;

export const ApiVersionPolicy = z
  .object({
    scheme: z.enum(["url-path"]).meta({ description: "How a client selects a version." }),
    deprecationNoticeDays: z.int().min(0).meta({
      description:
        "Minimum days between a version's first `Deprecation` header and its sunset date."
    }),
    rules: z.array(z.string()).readonly().meta({
      description:
        "The policy in full sentences, one commitment per entry. The developer portal publishes the same text."
    }),
    documentationUrl: text("Where the policy is documented for people.", { format: "uri" }),
    headers: z.record(z.string(), z.string()).meta({
      description:
        "The response headers that carry version and deprecation state, each mapped to what it means."
    })
  })
  .meta({ title: "ApiVersionPolicy", description: "The rules governing how this API changes." });

export const UnversionedAlias = z
  .object({
    basePath: text("The unversioned prefix.", { examples: [API_BASE] }),
    pinnedTo: text("The version it always resolves to."),
    note: text("The promise made about it, in one sentence.")
  })
  .meta({
    title: "UnversionedAlias",
    description: "The unversioned path prefix and the version it is permanently pinned to."
  });

export const ApiVersions = z
  .object({
    current: text("The newest version's path segment."),
    currentRelease: text("The semantic release the newest version serves."),
    unversionedAlias: UnversionedAlias,
    versions: z.array(ApiVersionRecord).meta({
      description: "Every version this deployment knows about, newest first."
    }),
    policy: ApiVersionPolicy
  })
  .meta({ title: "ApiVersions", description: "Response body of getApiVersions." });

/** Newest first. Headers, `/api/versions` and the OpenAPI document all read from this. */
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
  `The version is a path segment. Every endpoint lives under ${VERSIONED_API_BASE}. There is no version header and no version query parameter. The URL is the version.`,
  `The unversioned ${API_BASE}/... prefix is a permanent alias for ${CURRENT_API_VERSION} and will never be repointed at a later major version. Code against either; both keep answering ${CURRENT_API_VERSION} for as long as ${CURRENT_API_VERSION} exists.`,
  "Additive changes ship inside a version without notice: new endpoints, new optional request fields, new response fields. Ignore fields you do not know rather than rejecting them.",
  "Breaking changes never ship inside a version. Removing or renaming a field or endpoint, changing a field's type, narrowing an enum, or changing what a status code means all require a new path version.",
  `A deprecated version answers every request with a Deprecation header (RFC 9745), a Sunset header (RFC 8594), and Link relations of deprecation and successor-version. At least ${DEPRECATION_NOTICE_DAYS} days pass between the first Deprecation header and the Sunset date.`,
  `Every response carries API-Version (the release being served) and API-Supported-Versions. ${API_PATHS.versions} is the machine-readable form of this policy and is also reachable at ${API_BASE}/versions.`,
  "After sunset a version answers 410 Gone with the standard error envelope, pointing at its successor. Paths are never silently reused."
];
