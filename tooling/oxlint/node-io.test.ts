import plugin from "./node-io.ts";
import { tester } from "./rule-tester.ts";

tester.run("no-sync", plugin.rules["no-sync"], {
  valid: [
    {
      name: "the promise APIs, WorkerEnv.useSync, a computed member, and a Sync name that isn't called",
      code: `const text = await readFile("a.txt", "utf8");
const mail = WorkerEnv.useSync(env => env.MAIL);
const value = storage["readSync"]();
const sync = useSyncExternalStore;`
    }
  ],
  invalid: [
    {
      name: "a bare call, a member call on any object, and a call on Bun's global",
      code: `readFileSync("a.txt");
fs.existsSync("a");
storage.transactionSync(() => 1);
Bun.spawnSync(["ls"]);`,
      errors: [
        { messageId: "sync", data: { name: "readFileSync" }, line: 1 },
        { messageId: "sync", data: { name: "existsSync" }, line: 2 },
        { messageId: "sync", data: { name: "transactionSync" }, line: 3 },
        { messageId: "sync", data: { name: "spawnSync" }, line: 4 }
      ]
    }
  ]
});
