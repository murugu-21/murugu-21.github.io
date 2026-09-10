// Live-tests the lead-capture flow against the real DeepSeek model, which
// prompt.ts requires before any DEEPSEEK_MODEL swap: qwen3-30b was reverted on
// 2026-08-17 for narrating captures ("I've noted it") without ever calling
// capture_opportunity, silently losing leads. Unit tests can't catch that —
// only the live model can.
//
//   npm run test:capture [-- <model>]
//
// Needs DEEPSEEK_API_KEY in .dev.vars and a built dist/llms.txt (the real
// grounding). Costs a few tenths of a cent. Exits non-zero if the model fails
// to call the tool, or claims the lead was recorded without calling it.
import { readFileSync } from "node:fs";

import { buildMessages, TOOLS, type ModelMessage, type ModelToolCall } from "../worker/prompt.ts";
import type { ChatHistoryEntry } from "../worker/protocol.ts";

// ai.ts can't be imported here — it resolves its own imports the bundler way,
// which bare Node won't do — so read the two constants out of its source and
// keep it the single source of truth.
const aiSource = readFileSync("worker/ai.ts", "utf8");
const constant = (name: string): string =>
  aiSource.match(new RegExp(`^export const ${name} = "(.*)";$`, "m"))?.[1] ??
  (() => {
    throw new Error(`${name} not found in worker/ai.ts`);
  })();

const DEEPSEEK_BASE_URL = constant("DEEPSEEK_BASE_URL");
const model = process.argv[2] ?? constant("DEEPSEEK_MODEL");
const apiKey = readFileSync(".dev.vars", "utf8")
  .match(/^DEEPSEEK_API_KEY=(.*)$/m)?.[1]
  .trim();
if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing from .dev.vars");
const grounding = readFileSync("dist/llms.txt", "utf8");

// A visitor who is unmistakably a lead: intent, then specifics, then contact.
const visitorTurns = [
  "hey, are you available for contract work?",
  "we need a senior TS/Node engineer for a 3 month contract, starting October, remote.",
  "I'm Dana Okafor, dana.okafor@northlane.io — can you pass this to Murugappan?"
];

// The exact regression to guard: prose that tells the visitor the lead is
// handled. Harmless on its own — it only damns the model if no capture call
// ever follows, which is precisely how qwen3-30b lost leads.
const CLAIMS_RECORDED =
  /\b(noted (it|this|that)|pass(ed|ing)? (it |this )?(on|along)|forwarded|be in touch|let him know)\b/i;

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
      // The Worker only ever stores user/assistant turns; this script feeds the
      // tool round-trip back in as well, which buildMessages passes through.
      messages: buildMessages(grounding, history as ChatHistoryEntry[]),
      tools: TOOLS,
      thinking: { type: "enabled" }
    })
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);

  const { choices } = (await res.json()) as {
    choices: { message: { content?: string; tool_calls?: ModelToolCall[] } }[];
  };
  const message = choices[0].message;
  const toolCalls = message.tool_calls ?? [];
  const content = (message.content ?? "").trim();

  console.log(`\nvisitor: ${turn}`);
  console.log(`jarvis : ${content || "(no prose)"}`);
  console.log(`tools  : ${toolCalls.map(c => c.function.name).join(", ") || "(none)"}`);

  const capture = toolCalls.find(c => c.function.name === "capture_opportunity");
  if (capture) captured = JSON.parse(capture.function.arguments) as { contact?: string };
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

// The contact detail is the whole point of the tool call: a capture that
// drops it reaches Murugappan as an unreplyable note.
const carriesContact = captured?.contact?.includes("dana.okafor@northlane.io") ?? false;

console.log(`\n--- ${model} ---`);
console.log(`capture_opportunity called: ${captured ? "yes" : "NO"}`);
if (captured) console.log(`arguments: ${JSON.stringify(captured)}`);
if (captured && !carriesContact) console.log("capture dropped the visitor's contact detail");
if (!captured && falseClaim) console.log(`claimed handled but never called: ${falseClaim}`);
process.exit(carriesContact ? 0 : 1);
