import { describe, expect, it } from "vitest";

import {
  MAX_MESSAGE_LENGTH,
  parseClientMessage,
  parseVisitorContext,
  toolFrame,
  VISITOR_COUNTRY_HEADER,
  VISITOR_IP_HEADER
} from "../protocol";

describe("parseClientMessage", () => {
  it("accepts a valid chat message and trims it", () => {
    const msg = parseClientMessage(JSON.stringify({ type: "chat", text: "  hi there  " }));
    expect(msg).toEqual({ type: "chat", text: "hi there" });
  });

  it("rejects non-string input", () => {
    expect(parseClientMessage(new ArrayBuffer(8))).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(parseClientMessage("{nope")).toBeNull();
  });

  it("rejects unknown types and missing text", () => {
    expect(parseClientMessage(JSON.stringify({ type: "ping" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "chat" }))).toBeNull();
  });

  it("accepts a valid page path and drops invalid ones", () => {
    expect(
      parseClientMessage(JSON.stringify({ type: "chat", text: "hi", page: "/blog/react/" }))?.page
    ).toBe("/blog/react/");
    for (const bad of ["blog/react", "https://evil.example/x", "/a b", "x"]) {
      expect(
        parseClientMessage(JSON.stringify({ type: "chat", text: "hi", page: bad }))?.page
      ).toBeUndefined();
    }
  });

  it("rejects empty and oversized messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: "   " }))).toBeNull();
    const big = "x".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(parseClientMessage(JSON.stringify({ type: "chat", text: big }))).toBeNull();
  });
});

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

  it("keeps the half it has when the other header is missing", () => {
    const headers = new Headers({ [VISITOR_IP_HEADER]: "203.0.113.7" });
    expect(parseVisitorContext(headers)).toEqual({ country: null, ip: "203.0.113.7" });
  });

  it("returns null when the edge learned nothing (or sent blanks)", () => {
    expect(parseVisitorContext(new Headers())).toBeNull();
    expect(parseVisitorContext(new Headers({ [VISITOR_COUNTRY_HEADER]: "  " }))).toBeNull();
  });

  it("caps a forged value instead of storing it whole", () => {
    const headers = new Headers({ [VISITOR_IP_HEADER]: "x".repeat(200) });
    expect(parseVisitorContext(headers)?.ip).toHaveLength(64);
  });
});

describe("toolFrame", () => {
  it("reports a page fetch as the site path, not the full url", () => {
    expect(toolFrame("fetch_page", "https://murugappan.dev/blog/react/")).toEqual({
      type: "tool",
      name: "fetch_page",
      detail: "/blog/react/"
    });
  });

  it("omits the detail when the url is missing or unparseable", () => {
    expect(toolFrame("fetch_page", null)).toEqual({
      type: "tool",
      name: "fetch_page"
    });
    expect(toolFrame("fetch_page", "not a url")).toEqual({
      type: "tool",
      name: "fetch_page"
    });
  });

  it("never carries a detail for a capture — contact details stay server-side", () => {
    expect(toolFrame("capture_opportunity")).toEqual({
      type: "tool",
      name: "capture_opportunity"
    });
  });
});
