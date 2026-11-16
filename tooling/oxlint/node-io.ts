import type { NodeOf, Plugin } from "./plugin-types.ts";

type Callee = NodeOf<"CallExpression">["callee"];

// WorkerEnv.useSync reads Effect's dependency container; it does no I/O.
const NOT_IO = new Set(["useSync"]);

function syncName(callee: Callee): string | undefined {
  const name =
    callee.type === "Identifier"
      ? callee.name
      : callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier"
        ? callee.property.name
        : undefined;
  return name?.endsWith("Sync") && !NOT_IO.has(name) ? name : undefined;
}

export default {
  meta: { name: "node-io" },
  rules: {
    "no-sync": {
      meta: {
        type: "problem",
        docs: { description: "I/O goes through async APIs, never a *Sync call." },
        messages: {
          sync: "{{name}} blocks the event loop. Await node:fs/promises for files, run processes with spawnCollect or spawnInherit from @murugappan/utils/node/process.ts, and check a path with exists or read one that may be missing with ifPresent from @murugappan/utils/node/fs.ts."
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            const name = syncName(node.callee);
            if (name) context.report({ node: node.callee, messageId: "sync", data: { name } });
          }
        };
      }
    }
  }
} satisfies Plugin;
