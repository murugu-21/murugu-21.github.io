import type { ESTree } from "vite-plus/lint/plugins";

export type VisitorKeys = Readonly<Record<string, readonly string[]>>;

export const equalityOperators: ReadonlySet<string> = new Set(["==", "===", "!=", "!=="]);

export const isStringLiteral = (
  node: ESTree.Node | null | undefined
): node is ESTree.StringLiteral => node?.type === "Literal" && typeof node.value === "string";

export function staticPropertyName(member: ESTree.MemberExpression): string | undefined {
  const { computed, property } = member;
  if (computed) return isStringLiteral(property) ? property.value : undefined;
  return property.type === "Identifier" ? property.name : undefined;
}

export function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

export function unwrapExpression(node: ESTree.Node): ESTree.Node {
  while (
    node.type === "ParenthesizedExpression" ||
    node.type === "ChainExpression" ||
    node.type === "TSAsExpression" ||
    node.type === "TSTypeAssertion" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSSatisfiesExpression"
  ) {
    node = node.expression;
  }
  return node;
}

function isNode(value: unknown): value is ESTree.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

export function childNodes(node: ESTree.Node, visitorKeys: VisitorKeys): ESTree.Node[] {
  const fields = new Map<string, unknown>(Object.entries(node));
  return (visitorKeys[node.type] ?? []).flatMap(key => {
    const value = fields.get(key);
    if (isNode(value)) return [value];
    return Array.isArray(value) ? value.filter(isNode) : [];
  });
}
