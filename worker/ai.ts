import {TOOLS, type ModelMessage} from "./prompt";
import {consumeSse, type StreamResult, type Usage} from "./sse";

// DeepSeek V4-Flash is the only chat provider. It replaced Workers AI
// (2026-08-27), which was slow enough to be visible in the widget and whose
// free neuron allocation cut replies off mid-stream.
export const DEEPSEEK_MODEL = "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

// When the API omits usage, fall back to a chars/4 heuristic; stringifying
// the messages overestimates slightly, which errs on the safe side for the
// spend budget.
function estimateUsage(messages: ModelMessage[], content: string): Usage {
  return {
    promptTokens: Math.ceil(JSON.stringify(messages).length / 4),
    completionTokens: Math.ceil(content.length / 4)
  };
}

// One exchange against DeepSeek's OpenAI-compatible chat completions
// endpoint. The request/response shapes are the strict OpenAI dialect the
// rest of the worker already speaks, so consumeSse parses the stream
// unchanged.
export async function runDeepseekExchange(
  apiKey: string,
  messages: ModelMessage[],
  onDelta: (text: string) => void,
  fetcher: typeof fetch = fetch
): Promise<StreamResult> {
  const res = await fetcher(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      tools: TOOLS,
      stream: true,
      stream_options: {include_usage: true},
      // V4-Flash thinks by default and its reasoning counts against any
      // output cap: under the old max_tokens: 800 a grounded question burned
      // the whole budget on `reasoning_content` (which this worker drops) and
      // returned an empty reply. Concierge answers need none of it.
      thinking: {type: "disabled"}
      // No max_tokens: it bounded the Workers AI neuron cost per call, and on
      // a paid API it only risked truncating a long answer mid-sentence.
      // Reply length is governed by the prompt, total spend by the
      // RateLimiter's daily budget.
    })
  });
  if (!res.ok || !res.body) {
    throw new Error(`deepseek request failed: ${res.status}`);
  }
  const result = await consumeSse(res.body, onDelta);
  result.usage ??= estimateUsage(messages, result.content);
  return result;
}
