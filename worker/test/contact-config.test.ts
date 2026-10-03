import { describe, expect, it } from "vitest";

import { contactConfigProblem } from "../contact-config";

const config = ({ inbox, destination }: { inbox: string; destination?: string }) => ({
  vars: { OPPORTUNITY_INBOX: inbox },
  send_email: [{ name: "EMAIL", destination_address: destination }]
});

describe("contactConfigProblem", () => {
  it("accepts an inbox the email binding is locked to, and only that one", () => {
    expect(
      contactConfigProblem(config({ inbox: "ada@example.com", destination: "ada@example.com" }))
    ).toBeNull();
    expect(
      contactConfigProblem(config({ inbox: "ada@example.com", destination: "bob@example.com" }))
    ).toContain("destination_address");
  });

  it.each([
    [
      "a malformed inbox",
      config({ inbox: "ada-at-example.com", destination: "ada-at-example.com" }),
      "must be a valid email address"
    ],
    ["an unlocked binding", config({ inbox: "ada@example.com" }), "destination_address"],
    ["a missing inbox", { vars: {}, send_email: [] }, "OPPORTUNITY_INBOX"]
  ])("rejects %s", (_label, input, reason) => {
    expect(contactConfigProblem(input)).toContain(reason);
  });
});
