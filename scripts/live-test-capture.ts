// Live-tests lead capture against the real model; required before any
// DEEPSEEK_MODEL swap, since only a live model shows whether it narrates a
// capture without calling capture_opportunity.
//
//   bun run test:capture [<model>]
//
// Needs DEEPSEEK_API_KEY in .dev.vars and a built llms.txt.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { generateText, type ModelMessage } from "ai";

// oxlint-disable-next-line no-restricted-imports -- the Worker's model config is what this tests
import { deepseek, DEEPSEEK_MODEL, jarvisCall } from "#worker/ai.ts";
// oxlint-disable-next-line no-restricted-imports -- the Worker's prompt and tools are what this tests
import { buildMessages, jarvisTools, type Lead } from "#worker/prompt.ts";
import { SITE_DIR } from "./site-dir.ts";

const model = process.argv[2] ?? DEEPSEEK_MODEL;
const apiKey = readFileSync(".dev.vars", "utf8")
  .match(/^DEEPSEEK_API_KEY=(.*)$/m)?.[1]
  .trim();
if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing from .dev.vars");
const grounding = readFileSync(join(SITE_DIR, "llms.txt"), "utf8");

// A visitor who is an obvious lead: intent, then specifics, then contact.
const visitorTurns = [
  "hey, are you available for contract work?",
  "we need a senior TS/Node engineer for a 3 month contract, starting October, remote.",
  "I'm Dana Okafor, dana.okafor@northlane.io. Can you pass this to Murugappan?"
];

// Prose claiming the lead is handled; a failure only if no capture follows.
const CLAIMS_RECORDED =
  /\b(noted (it|this|that)|pass(ed|ing)? (it |this )?(on|along)|forwarded|be in touch|let him know)\b/i;

const history: ModelMessage[] = [];
const captures: Lead[] = [];
let falseClaim: string | null = null;

const tools = jarvisTools({
  fetchPage: async () => "This page has no further detail.",
  captureLead: async lead => {
    captures.push(lead);
  }
});

for (const turn of visitorTurns) {
  history.push({ role: "user", content: turn });
  const result = await generateText(
    jarvisCall({
      model: deepseek({ apiKey, model }),
      messages: buildMessages(grounding, history),
      tools
    })
  );
  const content = result.text.trim();
  const toolNames = result.steps.flatMap(step => step.toolCalls.map(call => call.toolName));

  console.log(`\nvisitor: ${turn}`);
  console.log(`jarvis : ${content || "(no prose)"}`);
  console.log(`tools  : ${toolNames.join(", ") || "(none)"}`);

  if (!captures.length && CLAIMS_RECORDED.test(content)) falseClaim ??= content;
  history.push(...result.responseMessages);
}

const captured = captures.at(-1);
// A capture without the contact detail is unreplyable.
const carriesContact = captured?.contact.includes("dana.okafor@northlane.io") ?? false;

console.log(`\n--- ${model} ---`);
console.log(`capture_opportunity called: ${captured ? "yes" : "NO"}`);
if (captured) console.log(`arguments: ${JSON.stringify(captured)}`);
if (captured && !carriesContact) console.log("capture dropped the visitor's contact detail");
if (!captured && falseClaim) console.log(`claimed handled but never called: ${falseClaim}`);
process.exit(carriesContact ? 0 : 1);
