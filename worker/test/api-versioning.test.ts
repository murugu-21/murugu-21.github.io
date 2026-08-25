import {describe, expect, it} from "vitest";

import {
  API_BASE,
  API_PATHS,
  CURRENT_API_VERSION,
  VERSIONED_API_BASE
} from "../api/routes";
import {
  API_VERSION,
  buildVersionsDocument,
  CURRENT_VERSION_RECORD,
  DEPRECATION_NOTICE_DAYS,
  deprecationFieldValue,
  POLICY_RULES,
  sunsetFieldValue,
  versionHeaders,
  versionLinkHeader,
  VERSIONS,
  type VersionRecord
} from "../api/versioning";

const deprecated: VersionRecord = {
  ...CURRENT_VERSION_RECORD,
  status: "deprecated",
  deprecatedOn: "2027-01-01",
  sunsetOn: "2027-07-01",
  successor: "v2"
};

describe("the version catalogue", () => {
  it("has exactly one current version, and it is the newest entry", () => {
    expect(VERSIONS.filter(v => v.status === "current")).toHaveLength(1);
    expect(VERSIONS[0]).toBe(CURRENT_VERSION_RECORD);
    expect(CURRENT_VERSION_RECORD.status).toBe("current");
  });

  it("agrees with the paths the router actually serves", () => {
    expect(CURRENT_VERSION_RECORD.version).toBe(CURRENT_API_VERSION);
    expect(CURRENT_VERSION_RECORD.basePath).toBe(VERSIONED_API_BASE);
    expect(CURRENT_VERSION_RECORD.release).toBe(API_VERSION);
  });

  it("claims no sunset for a version that is still current", () => {
    expect(CURRENT_VERSION_RECORD.deprecatedOn).toBeNull();
    expect(CURRENT_VERSION_RECORD.sunsetOn).toBeNull();
    expect(CURRENT_VERSION_RECORD.successor).toBeNull();
  });
});

describe("versionHeaders", () => {
  it("names the release being served and every version still answering", () => {
    expect(versionHeaders()).toEqual({
      "API-Version": API_VERSION,
      "API-Supported-Versions": CURRENT_API_VERSION
    });
  });

  it("omits Deprecation and Sunset while nothing is deprecated", () => {
    expect(versionHeaders()).not.toHaveProperty("Deprecation");
    expect(versionHeaders()).not.toHaveProperty("Sunset");
  });

  it("announces a deprecation with the RFC 9745 and RFC 8594 fields", () => {
    const headers = versionHeaders(deprecated);
    // RFC 9745: a Date structured field — "@" then a Unix timestamp.
    expect(headers.Deprecation).toBe("@1798761600");
    // RFC 8594: an HTTP-date, the same format Retry-After uses.
    expect(headers.Sunset).toBe("Thu, 01 Jul 2027 00:00:00 GMT");
  });
});

describe("deprecation field encoding", () => {
  it("encodes a date as seconds since the epoch, at midnight UTC", () => {
    expect(deprecationFieldValue("1970-01-02")).toBe("@86400");
  });

  it("encodes a sunset as an IMF-fixdate", () => {
    expect(sunsetFieldValue("1970-01-02")).toBe(
      "Fri, 02 Jan 1970 00:00:00 GMT"
    );
  });
});

describe("versionLinkHeader", () => {
  const link = versionLinkHeader();

  it("points at the spec, the docs and the version history", () => {
    expect(link).toContain(`<${API_PATHS.openapiRoot}>; rel="service-desc"`);
    expect(link).toContain('rel="service-doc"');
    expect(link).toContain(`<${API_PATHS.versions}>; rel="version-history"`);
    expect(link).toContain('rel="latest-version"');
    expect(link).toContain('rel="api-catalog"');
  });

  it("adds the migration pointers only once a version is deprecated", () => {
    expect(link).not.toContain('rel="deprecation"');
    expect(link).not.toContain('rel="successor-version"');
    const deprecatedLink = versionLinkHeader(deprecated);
    expect(deprecatedLink).toContain('rel="deprecation"');
    expect(deprecatedLink).toContain(
      `<${API_BASE}/v2>; rel="successor-version"`
    );
  });
});

describe("buildVersionsDocument", () => {
  const doc = buildVersionsDocument("https://murugappan.dev");

  it("names the current version and its release", () => {
    expect(doc.current).toBe(CURRENT_API_VERSION);
    expect(doc.currentRelease).toBe(API_VERSION);
  });

  it("pins the unversioned alias, in a promise a client can read", () => {
    expect(doc.unversionedAlias.basePath).toBe(API_BASE);
    expect(doc.unversionedAlias.pinnedTo).toBe(CURRENT_API_VERSION);
    expect(doc.unversionedAlias.note).toContain("never");
  });

  it("makes every URL absolute against the host that was asked", () => {
    expect(doc.versions[0].url).toBe(
      `https://murugappan.dev${VERSIONED_API_BASE}`
    );
    expect(doc.versions[0].specUrl).toBe("https://murugappan.dev/openapi.json");
    expect(doc.policy.documentationUrl).toBe(
      "https://murugappan.dev/developers/#versioning"
    );
  });

  it("states the policy, the notice period and the headers that carry it", () => {
    expect(doc.policy.scheme).toBe("url-path");
    expect(doc.policy.deprecationNoticeDays).toBe(DEPRECATION_NOTICE_DAYS);
    expect(doc.policy.rules).toEqual(POLICY_RULES);
    expect(Object.keys(doc.policy.headers).sort()).toEqual([
      "API-Supported-Versions",
      "API-Version",
      "Deprecation",
      "Link",
      "Sunset"
    ]);
  });

  it("covers the whole promise: selection, change, deprecation, sunset", () => {
    const text = doc.policy.rules.join(" ");
    expect(text).toContain("path segment");
    expect(text).toContain("Additive changes");
    expect(text).toContain("Breaking changes");
    expect(text).toContain("RFC 9745");
    expect(text).toContain("RFC 8594");
    expect(text).toContain("410");
  });

  it("serialises to JSON", () => {
    expect(() => JSON.stringify(doc)).not.toThrow();
  });
});
