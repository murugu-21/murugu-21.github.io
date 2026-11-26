// Both harnesses need an absolute path to agent-shell: a relative one breaks once the agent
// cds into a subfolder.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

const JsonObject = z.record(z.string(), z.unknown());
const Env = z.record(z.string(), z.string()).optional();
const Missing = z.object({ code: z.literal("ENOENT") });
const hasSandboxExec = process.platform === "darwin";

async function readIfPresent(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if (Missing.safeParse(err).success) return undefined;
    throw err;
  }
}

async function readJsonObject(path: string) {
  try {
    const text = await readIfPresent(path);
    return text === undefined ? {} : JsonObject.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`agents: fix or delete ${path}, then rerun bun install`, { cause: err });
  }
}

async function writeJsonIfChanged({ path, value }: { path: string; value: unknown }) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if ((await readIfPresent(path)) === text) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

if (hasSandboxExec) {
  const root = resolve(import.meta.dirname, "../..");
  const agentShell = join(root, "tooling/agents/agent-shell");

  const claudePath = join(root, ".claude/settings.local.json");
  const claude = await readJsonObject(claudePath);
  await writeJsonIfChanged({
    path: claudePath,
    value: { ...claude, env: { ...Env.parse(claude.env), CLAUDE_CODE_SHELL_PREFIX: agentShell } }
  });

  const openCodePath = join(root, ".opencode/opencode.json");
  await writeJsonIfChanged({
    path: openCodePath,
    value: { ...(await readJsonObject(openCodePath)), shell: agentShell }
  });
}
