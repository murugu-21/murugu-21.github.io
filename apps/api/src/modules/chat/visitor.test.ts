import { describe, expect, it } from "vite-plus/test";

import {
  parseVisitorContext,
  VISITOR_COUNTRY_HEADER,
  VISITOR_IP_HEADER
} from "#src/modules/chat/visitor.ts";

describe("parseVisitorContext", () => {
  it("returns the country and IP the edge attached, trimmed", () => {
    const headers = new Headers({
      [VISITOR_COUNTRY_HEADER]: " IN ",
      [VISITOR_IP_HEADER]: " 203.0.113.7 "
    });
    expect(parseVisitorContext(headers)).toEqual({
      country: "IN",
      ip: "203.0.113.7"
    });
  });

  it("treats a missing or blank header as unknown, and null when both are", () => {
    const ipOnly = new Headers({
      [VISITOR_COUNTRY_HEADER]: "  ",
      [VISITOR_IP_HEADER]: "203.0.113.7"
    });
    expect(parseVisitorContext(ipOnly)).toEqual({ country: null, ip: "203.0.113.7" });
    expect(parseVisitorContext(new Headers())).toBeNull();
    expect(parseVisitorContext(new Headers({ [VISITOR_COUNTRY_HEADER]: "  " }))).toBeNull();
  });

  it("caps a forged value instead of storing it whole", () => {
    const headers = new Headers({ [VISITOR_IP_HEADER]: "x".repeat(200) });
    expect(parseVisitorContext(headers)?.ip).toHaveLength(64);
  });
});
