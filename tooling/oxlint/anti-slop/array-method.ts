import type { ESTree, SourceCode, Variable } from "vite-plus/lint/plugins";

import { staticPropertyName, unwrapExpression } from "./ast.ts";
import { constInitializer, resolveVariable } from "./scope.ts";

export function resolveArrayBinding(sourceCode: SourceCode, node: ESTree.Node): Variable | null {
  node = unwrapExpression(node);
  return node.type === "Identifier" ? resolveVariable(sourceCode, node) : null;
}

export function arrayMethodTarget(
  node: ESTree.Node
): { readonly name: string; readonly object: ESTree.Node } | null {
  node = unwrapExpression(node);
  if (node.type !== "MemberExpression") return null;
  const name = staticPropertyName(node);
  return name === undefined ? null : { name, object: node.object };
}

function isArrayAnnotation(type: ESTree.TSType): boolean {
  if (type.type === "TSArrayType" || type.type === "TSTupleType") return true;
  if (type.type === "TSParenthesizedType") return isArrayAnnotation(type.typeAnnotation);
  if (type.type === "TSTypeOperator" && type.operator === "readonly") {
    return isArrayAnnotation(type.typeAnnotation);
  }
  return (
    type.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    (type.typeName.name === "Array" || type.typeName.name === "ReadonlyArray")
  );
}

// Only local evidence counts: unknown receivers and iterator pipelines are deliberately not arrays.
export function isKnownArrayExpression(
  sourceCode: SourceCode,
  node: ESTree.Node,
  visited = new Set<Variable>()
): boolean {
  node = unwrapExpression(node);
  if (node.type === "ArrayExpression") return true;
  if (node.type === "CallExpression") {
    const method = arrayMethodTarget(node.callee);
    return (
      method !== null &&
      [
        "map",
        "filter",
        "flatMap",
        "slice",
        "concat",
        "toSorted",
        "toReversed",
        "toSpliced"
      ].includes(method.name) &&
      isKnownArrayExpression(sourceCode, method.object, visited)
    );
  }
  if (node.type !== "Identifier") return false;
  const variable = resolveArrayBinding(sourceCode, node);
  if (variable === null || visited.has(variable)) return false;
  visited.add(variable);
  if (variable.references.some(reference => reference.isWrite() && !reference.init)) return false;
  for (const identifier of variable.identifiers) {
    const annotation = identifier.typeAnnotation?.typeAnnotation;
    if (annotation !== undefined) return isArrayAnnotation(annotation);
  }
  const initializer = constInitializer(variable);
  return initializer !== undefined && isKnownArrayExpression(sourceCode, initializer, visited);
}
