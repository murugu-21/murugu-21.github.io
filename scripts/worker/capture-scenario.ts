// The scripted visitor live-test-capture.ts plays against the model, and how
// its run is judged.
import type { Lead } from "#worker/prompt.ts";

const CONTACT = "dana.okafor@northlane.io";

// A visitor who is an obvious lead: intent, then specifics, then contact.
export const VISITOR_TURNS = [
  "hey, are you available for contract work?",
  "we need a senior TS/Node engineer for a 3 month contract, starting October, remote.",
  `I'm Dana Okafor, ${CONTACT}. Can you pass this to Murugappan?`
];

// Prose claiming the lead is handled; a failure only if no capture follows.
const CLAIMS_RECORDED =
  /\b(noted (it|this|that)|pass(ed|ing)? (it |this )?(on|along)|forwarded|be in touch|let him know)\b/i;

export const claimsRecorded = (reply: string) => CLAIMS_RECORDED.test(reply);

// Passes only when the last capture carries the visitor's contact, since a
// capture without it is unreplyable.
export function captureVerdict({
  model,
  captured,
  falseClaim
}: {
  model: string;
  captured: Lead | undefined;
  falseClaim: string | null;
}): { pass: boolean; report: string[] } {
  const carriesContact = captured?.contact.includes(CONTACT) ?? false;
  const report = [`\n--- ${model} ---`, `capture_opportunity called: ${captured ? "yes" : "NO"}`];
  if (captured) report.push(`arguments: ${JSON.stringify(captured)}`);
  if (captured && !carriesContact) report.push("capture dropped the visitor's contact detail");
  if (!captured && falseClaim) report.push(`claimed handled but never called: ${falseClaim}`);
  return { pass: carriesContact, report };
}
