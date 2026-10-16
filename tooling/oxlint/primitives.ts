import { isStringLiteral } from "./anti-slop/ast.ts";
import type { NodeOf, Plugin } from "./plugin-types.ts";

type ObjectExpression = NodeOf<"ObjectExpression">;
type Member = ObjectExpression["properties"][number];

function keyOf(member: Member): string | undefined {
  if (member.type !== "Property" || member.computed) return undefined;
  const { key } = member;
  if (key.type === "Identifier") return key.name;
  return isStringLiteral(key) ? key.value : undefined;
}

const declaresObjectSchema = (node: ObjectExpression) =>
  node.properties.some(
    member =>
      member.type === "Property" &&
      keyOf(member) === "type" &&
      member.value.type === "Literal" &&
      member.value.value === "object"
  ) && node.properties.some(member => keyOf(member) === "properties");

const ENTITY = /&(lt|amp);/;

export default {
  meta: { name: "primitives" },
  rules: {
    "json-schema-literal": {
      meta: {
        type: "problem",
        docs: { description: "JSON Schema is generated from a zod schema, not written by hand." },
        messages: {
          handWritten:
            "Build the JSON Schema with z.toJSONSchema() from the zod schema in @murugappan/contracts, so it can't drift from the validator (zod › JSON Schema)."
        }
      },
      create(context) {
        return {
          ObjectExpression(node) {
            if (declaresObjectSchema(node)) context.report({ node, messageId: "handWritten" });
          }
        };
      }
    },
    "html-entity-literal": {
      meta: {
        type: "problem",
        docs: { description: "HTML is escaped by Astro or the schema helper, not by hand." },
        messages: {
          handEscaped:
            "Don't escape HTML by hand. Astro escapes every {expression} and attribute, and jsonLdHtml in apps/site/src/lib/schema.ts escapes a script body. Write the plain text and let them escape it (docs.astro.build › Template expressions)."
        }
      },
      create(context) {
        return {
          Literal(node) {
            if (isStringLiteral(node) && ENTITY.test(node.value)) {
              context.report({ node, messageId: "handEscaped" });
            }
          },
          TemplateElement(node) {
            if (ENTITY.test(node.value.raw)) context.report({ node, messageId: "handEscaped" });
          }
        };
      }
    }
  }
} satisfies Plugin;
