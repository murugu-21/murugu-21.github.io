import type { NodeOf, Plugin } from "./plugin-types.ts";

type VariableDeclaration = NodeOf<"VariableDeclaration">;
type Declarator = VariableDeclaration["declarations"][number];

const MUTABLE = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);
const READONLY = new Set(["ReadonlyMap", "ReadonlySet", "ReadonlyArray"]);

function mutableKind({ init }: Declarator): string | undefined {
  if (init?.type !== "NewExpression" || init.callee.type !== "Identifier") return undefined;
  return MUTABLE.has(init.callee.name) ? init.callee.name : undefined;
}

function typedReadonly({ id }: Declarator): boolean {
  const type = id.typeAnnotation?.typeAnnotation;
  if (type?.type === "TSTypeOperator") return type.operator === "readonly";
  return (
    type?.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    READONLY.has(type.typeName.name)
  );
}

export default {
  meta: { name: "workers" },
  rules: {
    "no-module-state": {
      meta: {
        type: "problem",
        docs: { description: "Module scope holds no state that one request could change." },
        messages: {
          variable:
            "An isolate serves many requests at once, so a module-scope `{{kind}}` leaks state between them. Keep it in the request, or in a *.store.ts if it's a per-isolate cache (apps/api/README.md › Layers).",
          collection:
            "An isolate serves many requests at once, so a module-scope {{kind}} leaks state between them. Type it Readonly{{kind}} if it's a constant, or move it to a *.store.ts (apps/api/README.md › Layers)."
        }
      },
      create(context) {
        return {
          VariableDeclaration(node) {
            const { parent } = node;
            const topLevel =
              parent.type === "Program" ||
              (parent.type === "ExportNamedDeclaration" && parent.parent.type === "Program");
            if (!topLevel) return;
            const { kind: keyword } = node;
            if (keyword === "let" || keyword === "var") {
              for (const declarator of node.declarations) {
                context.report({
                  node: declarator,
                  messageId: "variable",
                  data: { kind: keyword }
                });
              }
              return;
            }
            for (const declarator of node.declarations) {
              const kind = mutableKind(declarator);
              if (!kind || typedReadonly(declarator)) continue;
              context.report({ node: declarator, messageId: "collection", data: { kind } });
            }
          }
        };
      }
    },
    "sql-bindings": {
      meta: {
        type: "problem",
        docs: { description: "SQL text is a literal; values go in as bindings." },
        messages: {
          interpolated:
            "Don't build SQL from values: it opens the query to injection. Write ? placeholders and pass the values to .bind() or as sql.exec()'s later arguments (Cloudflare D1 › Query D1)."
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            const { callee } = node;
            if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
            if (callee.property.name !== "prepare" && callee.property.name !== "exec") return;
            const [sql] = node.arguments;
            const built =
              (sql?.type === "TemplateLiteral" && sql.expressions.length > 0) ||
              (sql?.type === "BinaryExpression" && sql.operator === "+");
            if (built) context.report({ node: sql, messageId: "interpolated" });
          }
        };
      }
    }
  }
} satisfies Plugin;
