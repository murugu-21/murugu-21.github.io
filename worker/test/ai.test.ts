import {describe, expect, it} from "vitest";

import {runModelExchange} from "../ai";
import {CAPTURE_TOOL, MODEL_ID} from "../prompt";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e));
      controller.close();
    }
  });
}

describe("runModelExchange", () => {
  it("requests the pinned model with streaming, tools and the given messages", async () => {
    let captured: {model?: string; options?: Record<string, unknown>} = {};
    const ai = {
      run: async (model: string, options: Record<string, unknown>) => {
        captured = {model, options};
        return sseStream(['data: {"response":"hi"}\n\n']);
      }
    };
    const result = await runModelExchange(
      ai,
      [{role: "user", content: "yo"}],
      () => {}
    );
    expect(captured.model).toBe(MODEL_ID);
    expect(captured.options).toMatchObject({
      stream: true,
      tools: [CAPTURE_TOOL]
    });
    expect(result.content).toBe("hi");
  });

  it("handles a non-stream chat-completions body", async () => {
    const ai = {
      run: async () => ({
        choices: [
          {
            message: {
              content: "sure",
              tool_calls: [
                {
                  function: {
                    name: "capture_opportunity",
                    arguments: '{"contact":"a@b.c","summary":"s"}'
                  }
                }
              ]
            }
          }
        ]
      })
    };
    const deltas: string[] = [];
    const result = await runModelExchange(ai, [], t => deltas.push(t));
    expect(result.content).toBe("sure");
    expect(deltas).toEqual(["sure"]);
    expect(result.toolCalls).toEqual([
      {
        name: "capture_opportunity",
        arguments: '{"contact":"a@b.c","summary":"s"}'
      }
    ]);
  });

  it("handles a non-stream response/tool_calls body", async () => {
    const ai = {
      run: async () => ({
        response: "ok",
        tool_calls: [
          {name: "capture_opportunity", arguments: {contact: "x", summary: "y"}}
        ]
      })
    };
    const result = await runModelExchange(ai, [], () => {});
    expect(result.content).toBe("ok");
    expect(result.toolCalls[0].name).toBe("capture_opportunity");
    expect(JSON.parse(result.toolCalls[0].arguments)).toEqual({
      contact: "x",
      summary: "y"
    });
  });
});
