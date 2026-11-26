import type { NodeOf, Plugin } from "./plugin-types.ts";

type Node = NodeOf<"ExportNamedDeclaration">["parent"];
type Export = { node: Node; value: Node | null; name: string };

const BEHAVIOUR = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
]);

const RUNS_SCHEMA = /^(?:safe)?(?:parse|decode|encode)(?:Async)?$/i;
const RETURNS_VALUE = new Set([
  "spa",
  "isOptional",
  "isNullable",
  "toJSONSchema",
  "prettifyError",
  "treeifyError",
  "flattenError",
  "formatError"
]);

const returnsValue = (method: string) => RUNS_SCHEMA.test(method) || RETURNS_VALUE.has(method);

function buildsSchema(fn: Node, zod: ReadonlySet<string>): boolean {
  if (fn.type !== "ArrowFunctionExpression" || fn.body.type !== "CallExpression") return false;
  let current: Node = fn.body;
  while (current.type === "CallExpression") {
    const callee: Node = current.callee;
    if (callee.type !== "MemberExpression" || callee.computed) return false;
    if (callee.property.type !== "Identifier" || returnsValue(callee.property.name)) return false;
    current = callee.object;
  }
  while (current.type === "MemberExpression") current = current.object;
  return current.type === "Identifier" && zod.has(current.name);
}

function declaredExports(node: NodeOf<"ExportNamedDeclaration">): Export[] {
  const { declaration } = node;
  if (declaration?.type === "VariableDeclaration") {
    return declaration.declarations.flatMap(({ id, init }) =>
      id.type === "Identifier" ? [{ node, value: init, name: id.name }] : []
    );
  }
  if (declaration?.type !== "FunctionDeclaration" && declaration?.type !== "ClassDeclaration") {
    return [];
  }
  return declaration.id ? [{ node, value: declaration, name: declaration.id.name }] : [];
}

function specifiedExports(node: NodeOf<"ExportNamedDeclaration">): Export[] {
  if (node.source) return [];
  return node.specifiers.flatMap(({ local }) =>
    local.type === "Identifier" ? [{ node, value: null, name: local.name }] : []
  );
}

function defaultExport(node: NodeOf<"ExportDefaultDeclaration">): Export {
  const value = node.declaration;
  const name = value.type === "Identifier" ? value.name : "the default export";
  return { node, value, name };
}

export default {
  meta: { name: "contracts" },
  rules: {
    "shapes-only": {
      meta: {
        type: "problem",
        docs: {
          description:
            "packages/contracts/ exports schemas, types and constants, not functions. An arrow function whose body is a zod schema counts as a schema."
        },
        messages: {
          exportedBehaviour:
            "packages/contracts/ exports schemas, types and constants, not functions or classes. Move {{name}} to the layer that calls it, or to packages/utils/ if the site and the Worker both do (README.md › Imports)."
        }
      },
      create(context) {
        const behaviour = new Map<string, Node>();
        const zod = new Set<string>();
        const exported: Export[] = [];

        return {
          ImportDeclaration(node) {
            if (node.source.value !== "zod") return;
            for (const { local } of node.specifiers) zod.add(local.name);
          },
          FunctionDeclaration(node) {
            if (node.id) behaviour.set(node.id.name, node);
          },
          ClassDeclaration(node) {
            if (node.id) behaviour.set(node.id.name, node);
          },
          VariableDeclarator(node) {
            if (node.id.type === "Identifier" && node.init && BEHAVIOUR.has(node.init.type)) {
              behaviour.set(node.id.name, node.init);
            }
          },
          ExportNamedDeclaration(node) {
            exported.push(...declaredExports(node), ...specifiedExports(node));
          },
          ExportDefaultDeclaration(node) {
            exported.push(defaultExport(node));
          },
          "Program:exit"() {
            for (const { node, value, name } of exported) {
              const fn = value && BEHAVIOUR.has(value.type) ? value : behaviour.get(name);
              if (!fn || buildsSchema(fn, zod)) continue;
              context.report({ node, messageId: "exportedBehaviour", data: { name } });
            }
          }
        };
      }
    }
  }
} satisfies Plugin;
