import {describe, expect, it} from "vitest";

import {
  formatContactEmail,
  formatOpportunityEmail,
  parseLeadArguments,
  SENDER_ADDRESS,
  sendContactEmail,
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

  it("sanitizes a newline-bearing name out of the subject header", () => {
    const {subject} = formatOpportunityEmail(
      {
        name: "line1\nline2",
        contact: "ada@lovelace.dev",
        summary: "CTO role"
      },
      []
    );
    expect(subject).not.toMatch(/[\r\n]/);
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

describe("formatContactEmail", () => {
  const message = {
    name: "Ada Lovelace",
    email: "ada@example.com",
    company: "Analytical Engines Ltd",
    message: "We are hiring a senior backend engineer."
  };

  it("names the sender in the subject", () => {
    expect(formatContactEmail(message).subject).toBe(
      "New message via the murugappan.dev API — Ada Lovelace"
    );
  });

  it("falls back to the email address when no name is given", () => {
    const {name: _dropped, ...anonymous} = message;
    expect(formatContactEmail(anonymous).subject).toBe(
      "New message via the murugappan.dev API — ada@example.com"
    );
  });

  it("puts every field and the reply-to address in the body", () => {
    const {text} = formatContactEmail(message);
    expect(text).toContain("Name:    Ada Lovelace");
    expect(text).toContain("Email:   ada@example.com");
    expect(text).toContain("Company: Analytical Engines Ltd");
    expect(text).toContain("We are hiring a senior backend engineer.");
    expect(text).toContain("POST /api/contact");
  });

  it("marks omitted optional fields rather than leaving a blank line", () => {
    const {name: _n, company: _c, ...bare} = message;
    const {text} = formatContactEmail(bare);
    expect(text).toContain("Name:    (not given)");
    expect(text).toContain("Company: (not given)");
  });
});

describe("sendContactEmail", () => {
  it("sends from the site address to the configured inbox", async () => {
    const sent: unknown[] = [];
    await sendContactEmail(
      {send: async msg => void sent.push(msg)},
      "inbox@example.com",
      {email: "ada@example.com", message: "Hello there, this is a message."}
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "inbox@example.com",
      from: SENDER_ADDRESS
    });
  });
});
