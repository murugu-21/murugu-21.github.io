import type { z } from "zod";

import {
  API_BASE,
  CURRENT_API_VERSION,
  VERSIONED_API_BASE
} from "@murugappan/contracts/api/routes.ts";
import {
  API_VERSION,
  ApiVersions,
  DEPRECATION_NOTICE_DAYS,
  POLICY_RULES,
  VERSIONS
} from "@murugappan/contracts/api/versioning.ts";

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
