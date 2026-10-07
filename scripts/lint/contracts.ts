// Oxlint JS plugin for README.md › Layers: contracts/ exports shapes (schemas, types and
// constants), never behaviour. Logic lives in the layer that runs it.
import type { RuleTester } from "oxlint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type Node = Parameters<NonNullable<Visitor["ExportNamedDeclaration"]>>[0]["parent"];

const BEHAVIOUR = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassDeclaration",
  "ClassExpression"
]);

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
        // Top-level names bound to a function or class, and the names exported, in any order.
        const behaviour = new Set<string>();
        const exported: { node: Node; value: Node | null; name: string }[] = [];

        return {
          FunctionDeclaration(node) {
            if (node.id) behaviour.add(node.id.name);
          },
          ClassDeclaration(node) {
            if (node.id) behaviour.add(node.id.name);
          },
          VariableDeclarator(node) {
            if (node.id.type === "Identifier" && node.init && BEHAVIOUR.has(node.init.type)) {
              behaviour.add(node.id.name);
            }
          },
          ExportNamedDeclaration(node) {
            const declaration = node.declaration;
            if (declaration?.type === "VariableDeclaration") {
              for (const d of declaration.declarations) {
                if (d.id.type === "Identifier")
                  exported.push({ node, value: d.init, name: d.id.name });
              }
            } else if (
              (declaration?.type === "FunctionDeclaration" ||
                declaration?.type === "ClassDeclaration") &&
              declaration.id
            ) {
              exported.push({ node, value: declaration, name: declaration.id.name });
            }
            // A re-export from another module is that module's to check.
            if (node.source) return;
            for (const specifier of node.specifiers) {
              if (specifier.local.type === "Identifier") {
                exported.push({ node, value: null, name: specifier.local.name });
              }
            }
          },
          ExportDefaultDeclaration(node) {
            const value = node.declaration;
            const name = value.type === "Identifier" ? value.name : "the default export";
            exported.push({ node, value, name });
          },
          "Program:exit"() {
            for (const { node, value, name } of exported) {
              if (!(value && BEHAVIOUR.has(value.type)) && !behaviour.has(name)) continue;
              context.report({ node, messageId: "exportedBehaviour", data: { name } });
            }
          }
        };
      }
    }
  }
} satisfies { meta: { name: string }; rules: Record<string, Rule> };
