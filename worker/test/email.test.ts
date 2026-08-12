import {describe, expect, it} from "vitest";

import {
  formatOpportunityEmail,
  parseLeadArguments,
  sendOpportunityEmail
} from "../email";

describe("parseLeadArguments", () => {
  it("parses valid tool arguments", () => {
    expect(
      parseLeadArguments(
        '{"name":"Ada","contact":"ada@lovelace.dev","summary":"CTO role"}'
      )
    ).toEqual({name: "Ada", contact: "ada@lovelace.dev", summary: "CTO role"});
  });

  it("rejects missing contact or summary, and malformed JSON", () => {
    expect(parseLeadArguments('{"summary":"x"}')).toBeNull();
    expect(parseLeadArguments('{"contact":"x"}')).toBeNull();
    expect(parseLeadArguments("nope")).toBeNull();
  });
});

describe("formatOpportunityEmail", () => {
  it("includes lead fields and full transcript", () => {
    const {subject, text} = formatOpportunityEmail(
      {
        name: "Ada",
        contact: "ada@lovelace.dev",
        summary: "CTO role at Analytical Engines"
      },
      [
        {role: "user", content: "hiring you!"},
        {role: "assistant", content: "great, what's your email?"}
      ]
    );
    expect(subject).toContain("Ada");
    expect(text).toContain("ada@lovelace.dev");
    expect(text).toContain("CTO role at Analytical Engines");
    expect(text).toContain("visitor: hiring you!");
    expect(text).toContain("assistant: great, what's your email?");
  });
});

describe("sendOpportunityEmail", () => {
  it("sends via the binding to the configured inbox", async () => {
    const sent: unknown[] = [];
    await sendOpportunityEmail(
      {send: async msg => void sent.push(msg)},
      "inbox@example.com",
      {contact: "a@b.c", summary: "s"},
      []
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "inbox@example.com",
      from: "chatbot@murugappan.dev"
    });
  });
});
