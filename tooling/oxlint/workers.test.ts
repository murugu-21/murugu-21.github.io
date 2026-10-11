import plugin from "./workers.ts";
import { tester } from "./rule-tester.ts";

tester.run("no-module-state", plugin.rules["no-module-state"], {
  valid: [
    {
      name: "constants, collections typed readonly, and state inside a function",
      code: `const LIMIT = 8;
export const ORIGINS: ReadonlySet<string> = new Set(["https://a.dev"]);
const CACHE: ReadonlyMap<string, number> = new Map();
const NAMES: readonly string[] = new Array(3);
function handle() {
  let count = 0;
  const seen = new Set();
  return { count, seen };
}`
    }
  ],
  invalid: [
    {
      name: "a top-level let or var, exported or not",
      code: `let hits = 0;
export var last;`,
      errors: [
        { messageId: "variable", data: { kind: "let" }, line: 1 },
        { messageId: "variable", data: { kind: "var" }, line: 2 }
      ]
    },
    {
      name: "a mutable collection, untyped or typed mutable",
      code: `const seen = new Set();
export const byRoom = new Map<string, number>();
const queue: string[] = new Array(), names: Set<string> = new Set();
const ids: ReadonlyMapLike<string> = new Map();`,
      errors: [
        { messageId: "collection", data: { kind: "Set" }, line: 1 },
        { messageId: "collection", data: { kind: "Map" }, line: 2 },
        { messageId: "collection", data: { kind: "Array" }, line: 3 },
        { messageId: "collection", data: { kind: "Set" }, line: 3 },
        { messageId: "collection", data: { kind: "Map" }, line: 4 }
      ]
    }
  ]
});

tester.run("sql-bindings", plugin.rules["sql-bindings"], {
  valid: [
    {
      name: "literal SQL with values bound",
      code: `db.prepare("SELECT * FROM messages WHERE room = ?").bind(room);
sql.exec(\`DELETE FROM counters WHERE key NOT LIKE ?\`, \`\${day}:%\`);
db.exec("CREATE TABLE t (id TEXT)");`
    }
  ],
  invalid: [
    {
      name: "SQL built by interpolation or concatenation",
      code: `db.prepare(\`SELECT * FROM messages WHERE room = '\${room}'\`);
this.sql.exec("DELETE FROM t WHERE id = " + id);
db.exec(\`DROP TABLE \${table}\`);`,
      errors: [
        { messageId: "interpolated", line: 1 },
        { messageId: "interpolated", line: 2 },
        { messageId: "interpolated", line: 3 }
      ]
    }
  ]
});
