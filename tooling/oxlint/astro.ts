// Type-aware lint doesn't run on .astro files, so an untyped prop would reach the template as
// `any` with nothing to catch it.
import type { NodeOf, Plugin } from "./plugin-types.ts";

type MemberExpression = NodeOf<"MemberExpression">;

const isAstroProps = ({ object, property }: MemberExpression) =>
  object.type === "Identifier" &&
  object.name === "Astro" &&
  property.type === "Identifier" &&
  property.name === "props";

export default {
  meta: { name: "astro" },
  rules: {
    "typed-props": {
      meta: {
        type: "problem",
        docs: { description: "A component that reads Astro.props declares a Props type." },
        messages: {
          untyped:
            "Declare an `interface Props { … }` (or `type Props`) for what Astro.props holds, so the props are typed (docs.astro.build › TypeScript › Component Props)."
        }
      },
      create(context) {
        let declared = false;
        const reads: MemberExpression[] = [];
        return {
          TSInterfaceDeclaration(node) {
            if (node.id.name === "Props") declared = true;
          },
          TSTypeAliasDeclaration(node) {
            if (node.id.name === "Props") declared = true;
          },
          ImportSpecifier(node) {
            if (node.local.name === "Props") declared = true;
          },
          MemberExpression(node) {
            if (isAstroProps(node)) reads.push(node);
          },
          "Program:exit"() {
            if (declared) return;
            for (const node of reads) context.report({ node, messageId: "untyped" });
          }
        };
      }
    }
  }
} satisfies Plugin;
