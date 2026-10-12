import { staticPropertyName } from "./ast.ts";
import { resolveVariable } from "./scope.ts";

import type { ESTree, SourceCode } from "vite-plus/lint/plugins";

function isGlobalReflect(sourceCode: SourceCode, expression: ESTree.Expression): boolean {
  if (expression.type !== "Identifier" || expression.name !== "Reflect") return false;
  if (sourceCode.isGlobalReference(expression)) return true;
  const variable = resolveVariable(sourceCode, expression);
  return variable === null || variable.defs.length === 0;
}

export function isGlobalReflectMethodCall(
  sourceCode: SourceCode,
  callee: ESTree.Expression,
  methodName: string
): boolean {
  return (
    callee.type === "MemberExpression" &&
    isGlobalReflect(sourceCode, callee.object) &&
    staticPropertyName(callee) === methodName
  );
}
