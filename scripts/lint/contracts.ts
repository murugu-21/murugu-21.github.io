// Oxlint JS plugin for README.md › Layers: contracts/ exports shapes (schemas, types and
// constants), never behaviour. Logic lives in the layer that runs it.
import type { RuleTester } from "oxlint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type NodeOf<K extends keyof Visitor> = Parameters<NonNullable<Visitor[K]>>[0];
type Node = NodeOf<"ExportNamedDeclaration">["parent"];
type Export = { node: Node; value: Node | null; name: string };

const BEHAVIOUR = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
]);

const declaredName = ({ id }: NodeOf<"FunctionDeclaration"> | NodeOf<"ClassDeclaration">) =>
  id ? [id.name] : [];

const boundToBehaviour = ({ id, init }: NodeOf<"VariableDeclarator">) =>
  id.type === "Identifier" && init && BEHAVIOUR.has(init.type) ? [id.name] : [];

// `export const a = …`, `export function f() {}` and `export class C {}`.
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

// `export { a, b as c }`. A re-export from another module is that module's to check.
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
        docs: { description: "contracts/ exports schemas, types and constants, not functions." },
        messages: {
          exportedBehaviour:
            "contracts/ exports schemas, types and constants, not functions or classes. Move {{name}} to the layer that calls it, or to utils/ if the site and the Worker both do (README.md › Layers)."
        }
      },
      create(context) {
        // Names bound to a function or class, and the names exported, in any order.
        const behaviour: string[] = [];
        const exported: Export[] = [];

        return {
          FunctionDeclaration(node) {
            behaviour.push(...declaredName(node));
          },
          ClassDeclaration(node) {
            behaviour.push(...declaredName(node));
          },
          VariableDeclarator(node) {
            behaviour.push(...boundToBehaviour(node));
          },
          ExportNamedDeclaration(node) {
            exported.push(...declaredExports(node), ...specifiedExports(node));
          },
          ExportDefaultDeclaration(node) {
            exported.push(defaultExport(node));
          },
          "Program:exit"() {
            for (const { node, value, name } of exported) {
              if (!(value && BEHAVIOUR.has(value.type)) && !behaviour.includes(name)) continue;
              context.report({ node, messageId: "exportedBehaviour", data: { name } });
            }
          }
        };
      }
    }
  }
} satisfies { meta: { name: string }; rules: Record<string, Rule> };
