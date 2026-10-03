import { describe, expect, it } from "vitest";

import {
  formatContactEmail,
  formatOpportunityEmail,
  parseLeadArguments,
  SENDER_ADDRESS,
  sendContactEmail,
  sendOpportunityEmail,
  type EmailLike
} from "../email";

describe("parseLeadArguments", () => {
  it("parses valid tool arguments, rejecting missing contact or summary and malformed JSON", () => {
    expect(
      parseLeadArguments('{"name":"Ada","contact":"ada@lovelace.dev","summary":"CTO role"}')
    ).toEqual({
      name: "Ada",
      contact: "ada@lovelace.dev",
      summary: "CTO role"
    });
    expect(parseLeadArguments('{"summary":"x"}')).toBeNull();
    expect(parseLeadArguments('{"contact":"x"}')).toBeNull();
    expect(parseLeadArguments("nope")).toBeNull();
  });
});

describe("formatOpportunityEmail", () => {
  it("includes lead fields and full transcript", () => {
    const { subject, text } = formatOpportunityEmail(
      {
        name: "Ada",
        contact: "ada@lovelace.dev",
        summary: "CTO role at Analytical Engines"
      },
      [
        { role: "user", content: "hiring you!" },
        { role: "assistant", content: "great, what's your email?" }
      ]
    );
    expect(subject).toContain("Ada");
    expect(text).toContain("ada@lovelace.dev");
    expect(text).toContain("CTO role at Analytical Engines");
    expect(text).toContain("visitor: hiring you!");
    expect(text).toContain("assistant: great, what's your email?");
  });

  it("sanitizes a newline-bearing name out of the subject header", () => {
    const { subject } = formatOpportunityEmail(
      {
        name: "line1\nline2",
        contact: "ada@lovelace.dev",
        summary: "CTO role"
      },
      []
    );
    expect(subject).toBe("New opportunity via murugappan.dev chat — line1 line2");
  });
});

describe("formatContactEmail", () => {
  const message = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer."
  };

  it("names the sender in the subject, falling back to the email address", () => {
    expect(formatContactEmail(message).subject).toContain("Ada Lovelace");
    const { name: _dropped, ...anonymous } = message;
    expect(formatContactEmail(anonymous).subject).toContain("ada@example.com");
  });

  it("puts every field and the source in the body", () => {
    const { text } = formatContactEmail(message);
    for (const value of Object.values(message)) expect(text).toContain(value);
    expect(text).toContain("POST /api/contact");
  });

  it("marks omitted optional fields rather than leaving a blank line", () => {
    const { name: _n, company: _c, ...bare } = message;
    const { text } = formatContactEmail(bare);
    expect(text).toContain("Name:    (not given)");
    expect(text).toContain("Company: (not given)");
  });
});

describe("sending", () => {
  it.each([
    [
      "an opportunity",
      (email: EmailLike) =>
        sendOpportunityEmail({
          email,
          inbox: "inbox@example.com",
          lead: { contact: "a@b.c", summary: "s" },
          transcript: []
        })
    ],
    [
      "a contact message",
      (email: EmailLike) =>
        sendContactEmail({
          email,
          inbox: "inbox@example.com",
          msg: { email: "ada@example.com", message: "Hello there, this is a message." }
        })
    ]
  ])("sends %s from the site address to the configured inbox", async (_label, sendWith) => {
    const sent: unknown[] = [];
    await sendWith({ send: async msg => void sent.push(msg) });
    expect(sent).toEqual([
      expect.objectContaining({ to: "inbox@example.com", from: SENDER_ADDRESS })
    ]);
  });
});
