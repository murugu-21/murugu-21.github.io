import { describe, expect, it } from "vitest";

import {
  CURRENT_VERSION_RECORD,
  type VersionRecord
} from "@murugappan/contracts/api/versioning.ts";
import { versionHeaders, versionLinkHeader } from "#src/common/http/version-headers.ts";

describe("version headers", () => {
  const deprecated: VersionRecord = {
    ...CURRENT_VERSION_RECORD,
    status: "deprecated",
    deprecatedOn: "2027-01-01",
    sunsetOn: "2027-07-01",
    successor: "v2"
  };

  it("names only the release and the supported versions while nothing is deprecated", () => {
    expect(versionHeaders()).toEqual({
      "API-Version": "1.0.0",
      "API-Supported-Versions": "v1"
    });
  });

  it("announces a deprecation with the RFC 9745 and RFC 8594 fields", () => {
    const headers = versionHeaders(deprecated);
    // RFC 9745: a Date structured field, "@" then a Unix timestamp.
    expect(headers.Deprecation).toBe("@1798761600");
    // RFC 8594: an HTTP-date, the same format Retry-After uses.
    expect(headers.Sunset).toBe("Thu, 01 Jul 2027 00:00:00 GMT");
  });

  it("links the spec, the docs and the version history", () => {
    const link = versionLinkHeader();
    expect(link).toContain('</openapi.json>; rel="service-desc"');
    expect(link).toContain('</developers/>; rel="service-doc"');
    expect(link).toContain('</api/v1/versions>; rel="version-history"');
    expect(link).toContain('rel="latest-version"');
    expect(link).toContain('rel="api-catalog"');
  });

  it("adds the migration pointers only once a version is deprecated", () => {
    const link = versionLinkHeader();
    expect(link).not.toContain('rel="deprecation"');
    expect(link).not.toContain('rel="successor-version"');
    const deprecatedLink = versionLinkHeader(deprecated);
    expect(deprecatedLink).toContain('</developers/#versioning>; rel="deprecation"');
    expect(deprecatedLink).toContain('</api/v2>; rel="successor-version"');
  });
});
