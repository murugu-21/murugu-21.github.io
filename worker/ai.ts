import { createDeepSeek } from "@ai-sdk/deepseek";
import { APICallError, stepCountIs, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";

import { lenient } from "#utils/json.ts";

// Always the current Flash generation. Before swapping it, run `bun run test:capture`,
// because some models narrate a lead capture without calling capture_opportunity and lose the lead.
export const DEEPSEEK_MODEL = "deepseek-flash";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

// Room for two page fetches and a capture; the step after the last tool step must answer in text.
const MAX_TOOL_STEPS = 3;

// 402 Insufficient Balance is authoritative; the cached balance can be stale.
export function isInsufficientBalance(err: unknown): boolean {
  return APICallError.isInstance(err) && err.statusCode === 402;
}

export function deepseek({
  apiKey,
  model = DEEPSEEK_MODEL
}: {
  apiKey: string;
  model?: string;
}): LanguageModel {
  return createDeepSeek({ apiKey })(model);
}

/** Settings for one Jarvis turn, shared by the Worker's streamText and the live capture test. */
export function jarvisCall<Tools extends ToolSet>({
  model,
  messages,
  tools
}: {
  model: LanguageModel;
  messages: ModelMessage[];
  tools: Tools;
}) {
  return {
    model,
    messages,
    // buildMessages puts the page note after the history, where it binds "this page".
    allowSystemInMessages: true,
    tools,
    // A retry bills the turn again.
    maxRetries: 0,
    // Reasoning improves tool-call choice. No maxOutputTokens: reasoning can
    // exhaust a cap and return an empty reply.
    providerOptions: { deepseek: { thinking: { type: "enabled" } } },
    stopWhen: stepCountIs(MAX_TOOL_STEPS + 1),
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === MAX_TOOL_STEPS ? { toolChoice: "none" as const } : {}
  };
}

export type DeepseekBalance = { available: boolean; totalUsd: number };

// `total_balance` arrives as a decimal string per currency.
const BalanceResponse = z.object({
  is_available: lenient(z.boolean()),
  balance_infos: lenient(
    z.array(
      lenient(z.object({ currency: z.string(), total_balance: z.union([z.string(), z.number()]) }))
    )
  )
});

export async function fetchDeepseekBalance(
  apiKey: string,
  fetcher: typeof fetch = fetch
): Promise<DeepseekBalance> {
  const res = await fetcher(`${DEEPSEEK_BASE_URL}/user/balance`, {
    headers: { authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error(`deepseek balance request failed: ${res.status}`);
  const body = BalanceResponse.parse(await res.json());
  const usd = body.balance_infos?.find(b => b?.currency === "USD");
  const totalUsd = Number(usd?.total_balance);
  return {
    available: body.is_available === true,
    totalUsd: Number.isFinite(totalUsd) ? totalUsd : 0
  };
}
