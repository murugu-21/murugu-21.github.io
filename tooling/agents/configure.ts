// Both harnesses need an absolute path to agent-shell: a relative one breaks once the agent
// cds into a subfolder.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const JsonObject = z.record(z.string(), z.unknown());
const Env = z.record(z.string(), z.string()).optional();
const hasSandboxExec = process.platform === "darwin";

function readJsonObject(path: string) {
  if (!existsSync(path)) return {};
  try {
    return JsonObject.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new Error(`agents: fix or delete ${path}, then rerun bun install`, { cause: err });
  }
}

// agent-shell refuses writes to these files, so an agent's `bun install` must not rewrite them.
function writeJsonIfChanged({ path, value }: { path: string; value: unknown }) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

if (hasSandboxExec) {
  const root = resolve(import.meta.dirname, "../..");
  const agentShell = join(root, "tooling/agents/agent-shell");

  const claudePath = join(root, ".claude/settings.local.json");
  const claude = readJsonObject(claudePath);
  writeJsonIfChanged({
    path: claudePath,
    value: { ...claude, env: { ...Env.parse(claude.env), CLAUDE_CODE_SHELL_PREFIX: agentShell } }
  });

  const openCodePath = join(root, ".opencode/opencode.json");
  writeJsonIfChanged({
    path: openCodePath,
    value: { ...readJsonObject(openCodePath), shell: agentShell }
  });
}
