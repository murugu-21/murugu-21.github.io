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

import { deepseek, DEEPSEEK_MODEL, jarvisCall } from "#worker/ai.ts";
import { buildMessages, jarvisTools, type Lead } from "#worker/prompt.ts";
// oxlint-disable-next-line no-restricted-imports -- Jarvis grounds on the built site's llms.txt, so this reads the site build
import { SITE_DIR } from "#scripts/site/site-dir.ts";
import { VISITOR_TURNS, captureVerdict, claimsRecorded, devVarsKey } from "./capture-scenario.ts";

const model = process.argv[2] ?? DEEPSEEK_MODEL;
const apiKey = devVarsKey(readFileSync(".dev.vars", "utf8"));
if (!apiKey) throw new Error("DEEPSEEK_API_KEY missing from .dev.vars");
const grounding = readFileSync(join(SITE_DIR, "llms.txt"), "utf8");

const history: ModelMessage[] = [];
const captures: Lead[] = [];
let falseClaim: string | null = null;

const tools = jarvisTools({
  fetchPage: async () => "This page has no further detail.",
  captureLead: async lead => {
    captures.push(lead);
  }
});

for (const turn of VISITOR_TURNS) {
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

  if (!captures.length && claimsRecorded(content)) falseClaim ??= content;
  history.push(...result.responseMessages);
}

const { pass, report } = captureVerdict({ model, captured: captures.at(-1), falseClaim });
for (const line of report) console.log(line);
process.exit(pass ? 0 : 1);
