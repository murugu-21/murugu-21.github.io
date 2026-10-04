// Live-tests lead capture against the real model; required before any
// DEEPSEEK_MODEL swap, since only a live model shows whether it narrates a
// capture without calling capture_opportunity.
//
//   bun run test:capture [<model>]
//
// Needs DEEPSEEK_API_KEY in .dev.vars and a built llms.txt.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "@worker/ai.ts";
import { jsonString } from "@worker/json.ts";
import { buildMessages, TOOLS, type ModelMessage } from "@worker/prompt.ts";
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

const Completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullish(),
          tool_calls: z
            .array(
              z.object({
                id: z.string(),
                type: z.literal("function"),
                function: z.object({ name: z.string(), arguments: z.string() })
              })
            )
            .optional()
        })
      })
    )
    .min(1)
});
// Loose so the report prints every argument the model sent.
const CaptureArguments = jsonString(z.looseObject({ contact: z.string().optional() }));

const history: ModelMessage[] = [];
let captured: { contact?: string } | null = null;
let falseClaim: string | null = null;

for (const turn of visitorTurns) {
  history.push({ role: "user", content: turn });
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      // Unlike the Worker, this feeds tool round-trips back.
      messages: buildMessages(grounding, history),
      tools: TOOLS,
      thinking: { type: "enabled" }
    })
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);

  const { choices } = Completion.parse(await res.json());
  const message = choices[0].message;
  const toolCalls = message.tool_calls ?? [];
  const content = (message.content ?? "").trim();

  console.log(`\nvisitor: ${turn}`);
  console.log(`jarvis : ${content || "(no prose)"}`);
  console.log(`tools  : ${toolCalls.map(c => c.function.name).join(", ") || "(none)"}`);

  const capture = toolCalls.find(c => c.function.name === "capture_opportunity");
  if (capture) captured = CaptureArguments.parse(capture.function.arguments);
  if (!captured && CLAIMS_RECORDED.test(content)) falseClaim ??= content;

  history.push({
    role: "assistant",
    content,
    tool_calls: toolCalls.length ? toolCalls : undefined
  });
  for (const call of toolCalls) {
    history.push({ role: "tool", tool_call_id: call.id, content: '{"ok":true}' });
  }
}

// A capture without the contact detail is unreplyable.
const carriesContact = captured?.contact?.includes("dana.okafor@northlane.io") ?? false;

console.log(`\n--- ${model} ---`);
console.log(`capture_opportunity called: ${captured ? "yes" : "NO"}`);
if (captured) console.log(`arguments: ${JSON.stringify(captured)}`);
if (captured && !carriesContact) console.log("capture dropped the visitor's contact detail");
if (!captured && falseClaim) console.log(`claimed handled but never called: ${falseClaim}`);
process.exit(carriesContact ? 0 : 1);
