---
title: Let the agent write code instead of calling tools

shortTitle: Code Mode for agents

date: "2026-11-04T09:00:00.000Z"

tags: ["ai", "system-design"]

keywords: ["llm-cost", "agents", "code-mode", "programmatic-tool-calling", "mcp", "context-window"]

description: How Code Mode keeps tool definitions and tool results out of an agent's context, with measured results from Cloudflare and Anthropic and what it costs to run.
---

[Part one](/blog/llms-production/) made the history an agent resends cheap with prompt caching, 85% off the example agent. [Part two](/blog/small-models-production/) moved fixed steps, such as prescription extraction, to smaller models. Agents with open-ended tasks and many tools still need a big model, so this post cuts how many tokens they send. Code Mode has the model write a short script that calls the tools, so most tool definitions and results never reach the model. Cloudflare uses it to offer its whole API in about 1,000 tokens, where ordinary tools would take 1.17 million.

## What fills an agent's context

Two kinds of tokens pile up in an agent's context, meaning everything the model reads on each request.

The first is tool definitions. Every request carries the name, description and input schema of every tool the agent can call. Anthropic counted 58 tools at about 55,000 tokens "before the conversation even starts" ([Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)). Many agents get their tools from MCP servers. MCP (Model Context Protocol) is the standard way to plug a set of tools into an agent, and each server you connect adds its tools to that list.

The second is tool results. With normal tool calling, the model asks for one tool at a time. Your code runs it and sends the result back as the next message, and the model reads the whole conversation again before it asks for the next tool. Every result lands in the context, even when the model needs one number from it. If the next tool needs that result, the model writes it out again as that tool's input, and you pay output price, five times the input price, for the copy. In the 30-turn agent from [part one](/blog/llms-production/#where-the-money-goes-in-an-agent), these results are the 3,000 tokens each turn adds.

## How Code Mode works

Cloudflare named the fix Code Mode ([announcement](https://blog.cloudflare.com/code-mode), September 2025). Turn the tools into a TypeScript API and ask the model to write code that calls it. The code runs in a sandbox, an isolated runtime that can call those tools and nothing else. Results pass from one tool to the next inside the sandbox, and the model reads back only the final value. Cloudflare's reasoning is that models have seen far more real code than examples of tool calls, so they write code more reliably than they make tool calls. Anthropic's version, built into the Claude API, is called programmatic tool calling.

Code Mode also shrinks the definitions. The model doesn't read the whole API up front. It searches for the functions the task needs and loads only those definitions. In Anthropic's [code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) write-up, loading definitions this way took an example from 150,000 tokens to 2,000.

Anthropic's docs give the example of checking whether 20 employees stayed within their expense budgets ([programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)). With tool calls, that takes 20 round trips through the model and pulls thousands of expense lines into the context. With code, one script does all 20 lookups and returns only the employees who went over. The model writes something like this. The function names are made up.

```ts
const team = await hr.listTeam({ teamId: "eng" })
const over = []
for (const person of team) {
  const items = await expenses.list({ employeeId: person.id, quarter: "Q3" })
  const spent = items.reduce((sum, item) => sum + item.amount, 0)
  if (spent > person.budget) {
    over.push({ name: person.name, spent, budget: person.budget })
  }
}
return over
```

Anthropic says this cut the data Claude reads from about 200KB of raw expense data to about 1KB of results ([Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)). The same write-up on code execution walks through copying a 2-hour meeting transcript from Google Drive into Salesforce. With tool calls the transcript goes through the model twice, about 50,000 extra tokens. With code it goes from one tool to the other inside the sandbox. Both are worked examples, not production measurements.

## Measured results

- **In production, Cloudflare's API.** The Cloudflare API has more than 2,500 endpoints. Cloudflare's MCP server offers all of them through two tools in about 1,000 tokens. `search()` finds the endpoints a task needs, and `execute()` runs the code the model writes against them. Cloudflare says the same server with one tool per endpoint "would consume 1.17 million tokens", more than any model can read in one request ([announcement](https://blog.cloudflare.com/code-mode-mcp/), February 2026).
- **In production, Cloudflare's internal tools.** Cloudflare's own agents reach internal tools through one gateway. Connected to four internal MCP servers, it offered 52 tools whose definitions took about 9,400 tokens. With Code Mode they became 2 tools in about 600 tokens, 94% fewer ([reference architecture](https://blog.cloudflare.com/enterprise-mcp), April 2026).
- **On Anthropic's research tasks.** Average usage dropped from 43,588 to 27,297 tokens, 37% less. Anthropic also runs it in production in Claude for Excel, on spreadsheets with thousands of rows ([Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)).

Code Mode and caching stack. Caching cuts the price of each resent token, and Code Mode cuts how many there are. A tool result kept out of turn 5 is never written to the cache, never read back on turns 6 to 30, and never copied out at output price.

## What it costs you

You now run code the model wrote. Anthropic's post says you need a locked-down place to run it, with "appropriate sandboxing, resource limits, and monitoring", and that this is work and risk that direct tool calls don't have. If you use Cloudflare's or Anthropic's version, they run the sandbox for you. If you build your own, you run it.

Check where the sandbox keeps data. Anthropic's programmatic tool calling keeps data "up to 30 days", and Anthropic says it isn't covered by its zero data retention or HIPAA arrangements ([data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). If your data includes health records, that rules out the hosted version. If you run the sandbox yourself, data that stays in it never reaches the model provider, which Anthropic lists as a privacy benefit.

Code Mode doesn't help every agent. Cloudflare's docs say "use direct tool calls for simple tasks with a small, fixed tool set" ([docs](https://developers.cloudflare.com/agents/tools/codemode/)). It pays off with many tools, with loops over many items, and when one tool's output feeds the next.

## Where to start

1. Turn on caching first, as in [part one](/blog/llms-production/#where-to-start). It makes every token the agent resends cheaper, with or without Code Mode.
2. Count how many tokens each request spends on tool definitions and on tool results.
3. If the agent has many tools, loops over many items, or feeds one tool's output into the next, use Code Mode, such as programmatic tool calling on the Claude API, so tool definitions and tool results stay out of the context.
4. Before you send sensitive data through a hosted sandbox, check what it keeps and for how long.
