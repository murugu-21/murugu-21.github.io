import type { ESTree } from "vite-plus/lint/plugins";

import { equalityOperators, isStringLiteral, staticPropertyName } from "./ast.ts";

const broadEffectCatchMethods = new Set(["catch", "catchAll", "catchIf"]);

export const isTagMember = (
  node: ESTree.Node | null | undefined
): node is ESTree.MemberExpression =>
  node?.type === "MemberExpression" && staticPropertyName(node) === "_tag";

export const tagMemberFromComparison = (
  node: ESTree.BinaryExpression
): ESTree.MemberExpression | undefined => {
  if (!equalityOperators.has(node.operator)) return undefined;
  if (isTagMember(node.left) && isStringLiteral(node.right)) return node.left;
  if (isTagMember(node.right) && isStringLiteral(node.left)) return node.right;
  return undefined;
};

const isBroadEffectCatchCall = (
  node: ESTree.Node | null | undefined
): node is ESTree.CallExpression =>
  node?.type === "CallExpression" &&
  node.callee.type === "MemberExpression" &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Effect" &&
  !node.callee.computed &&
  node.callee.property.type === "Identifier" &&
  broadEffectCatchMethods.has(node.callee.property.name);

export const isInsideBroadEffectHandler = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null | undefined = node.parent;
  while (current !== null && current !== undefined) {
    if (current.type === "ArrowFunctionExpression" || current.type === "FunctionExpression") {
      return isBroadEffectCatchCall(current.parent) && current.parent.arguments.includes(current);
    }
    current = current.parent;
  }
  return false;
};
