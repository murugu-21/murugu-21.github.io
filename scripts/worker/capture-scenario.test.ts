import { describe, expect, it } from "vitest";

import { captureVerdict, claimsRecorded, devVarsKey } from "./capture-scenario.ts";

describe("devVarsKey", () => {
  it("reads DEEPSEEK_API_KEY out of .dev.vars", () => {
    expect(devVarsKey("POSTHOG_KEY=ph\nDEEPSEEK_API_KEY= sk-123 \n")).toBe("sk-123");
    expect(devVarsKey("POSTHOG_KEY=ph\n")).toBe(undefined);
  });
});

describe("claimsRecorded", () => {
  it("spots a reply that says the lead was handed on", () => {
    expect(claimsRecorded("Thanks Dana, I've passed this along to him.")).toBe(true);
    expect(claimsRecorded("Could you share an email so he can reply?")).toBe(false);
  });
});

describe("captureVerdict", () => {
  const lead = { name: "Dana Okafor", summary: "3 month TS/Node contract" };

  it("passes only a capture that carries the visitor's email", () => {
    const captured = { ...lead, contact: "dana.okafor@northlane.io" };
    expect(captureVerdict({ model: "deepseek-chat", captured, falseClaim: null })).toEqual({
      pass: true,
      report: [
        "\n--- deepseek-chat ---",
        "capture_opportunity called: yes",
        `arguments: {"name":"Dana Okafor","summary":"3 month TS/Node contract","contact":"dana.okafor@northlane.io"}`
      ]
    });
    expect(
      captureVerdict({ model: "m", captured: { ...lead, contact: "Dana" }, falseClaim: null })
    ).toEqual({
      pass: false,
      report: [
        "\n--- m ---",
        "capture_opportunity called: yes",
        `arguments: {"name":"Dana Okafor","summary":"3 month TS/Node contract","contact":"Dana"}`,
        "capture dropped the visitor's contact detail"
      ]
    });
  });

  it("fails a run that claimed the lead was handled without capturing it", () => {
    expect(
      captureVerdict({ model: "m", captured: undefined, falseClaim: "I've forwarded it." })
    ).toEqual({
      pass: false,
      report: [
        "\n--- m ---",
        "capture_opportunity called: NO",
        "claimed handled but never called: I've forwarded it."
      ]
    });
  });
});
