// Oxlint JS plugin for README › Layers: contracts/ exports shapes (schemas, types and
// constants), never behaviour. Logic lives in the layer that runs it.
import type { RuleTester } from "oxlint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type ExportNamedDeclaration = Parameters<NonNullable<Visitor["ExportNamedDeclaration"]>>[0];

const FUNCTION_VALUES = new Set(["ArrowFunctionExpression", "FunctionExpression"]);

/** Names of the functions an `export` declaration defines. */
function exportedFunctions(node: ExportNamedDeclaration): string[] {
  const declaration = node.declaration;
  if (!declaration) return [];
  if (declaration.type === "FunctionDeclaration") return [declaration.id?.name ?? "default"];
  if (declaration.type !== "VariableDeclaration") return [];
  return declaration.declarations.flatMap(d =>
    d.init && FUNCTION_VALUES.has(d.init.type) && d.id.type === "Identifier" ? [d.id.name] : []
  );
}

export default {
  meta: { name: "contracts" },
  rules: {
    "shapes-only": {
      meta: {
        type: "problem",
        docs: { description: "contracts/ exports schemas, types and constants, not functions." },
        messages: {
          exportedFunction:
            "contracts/ exports schemas, types and constants, not functions. Move {{name}} to the layer that calls it, or to utils/ if the site and the Worker both do (README › Layers)."
        }
      },
      create(context) {
        return {
          ExportNamedDeclaration(node) {
            for (const name of exportedFunctions(node)) {
              context.report({ node, messageId: "exportedFunction", data: { name } });
            }
          }
        };
      }
    }
  }
} satisfies { meta: { name: string }; rules: Record<string, Rule> };
