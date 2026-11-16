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

const RESET = "resetStore";

type Declaration = { parent: { type: string; parent?: { type: string } | null } | null };

const isTopLevel = ({ parent }: Declaration) =>
  parent?.type === "Program" ||
  (parent?.type === "ExportNamedDeclaration" && parent.parent?.type === "Program");

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
    "store-exports-reset": {
      meta: {
        type: "problem",
        docs: { description: "A store exports resetStore, which empties its module state." },
        messages: {
          missing:
            "The workers tests run with isolate: false, so a store's module state outlives the test file that filled it. Export a resetStore that takes no arguments and empties it; apps/api/test/start-fresh.ts calls every store's resetStore before each file."
        }
      },
      create(context) {
        const topLevelNoArgFunctions = new Set<string>();
        const localNameByExport = new Map<string, string>();
        return {
          FunctionDeclaration(node) {
            if (node.id && node.params.length === 0 && isTopLevel(node))
              topLevelNoArgFunctions.add(node.id.name);
          },
          VariableDeclarator(node) {
            const { id, init } = node;
            const isFunction =
              init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression";
            if (id.type === "Identifier" && isFunction && init.params.length === 0)
              if (isTopLevel(node.parent)) topLevelNoArgFunctions.add(id.name);
          },
          ExportNamedDeclaration({ declaration, specifiers }) {
            if (declaration?.type === "FunctionDeclaration" && declaration.id)
              localNameByExport.set(declaration.id.name, declaration.id.name);
            if (declaration?.type === "VariableDeclaration")
              for (const { id } of declaration.declarations)
                if (id.type === "Identifier") localNameByExport.set(id.name, id.name);
            for (const { exported: name, local } of specifiers)
              if (name.type === "Identifier" && local.type === "Identifier")
                localNameByExport.set(name.name, local.name);
          },
          "Program:exit"(node) {
            const local = localNameByExport.get(RESET);
            if (local === undefined || !topLevelNoArgFunctions.has(local))
              context.report({ node, messageId: "missing" });
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
