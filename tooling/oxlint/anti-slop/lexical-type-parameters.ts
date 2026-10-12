import type { ESTree } from "vite-plus/lint/plugins";

import { childNodes, type VisitorKeys } from "./ast.ts";

function collectInferTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  names: Set<string>
): void {
  if (node.type === "TSInferType") names.add(node.typeParameter.name.name);
  for (const child of childNodes(node, visitorKeys)) {
    collectInferTypeParameterNames(child, visitorKeys, names);
  }
}

// Type parameters in scope here shadow a module alias of the same name.
export function lexicalTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys
): ReadonlySet<string> {
  const names = new Set<string>();
  let descendant: ESTree.Node = node;
  let current: ESTree.Node | null = node;
  while (current !== null && current.type !== "Program") {
    if ("typeParameters" in current) {
      for (const parameter of current.typeParameters?.params ?? []) {
        names.add(parameter.name.name);
      }
    }
    if (
      current.type === "TSMappedType" &&
      (descendant === current.nameType || descendant === current.typeAnnotation)
    ) {
      names.add(current.key.name);
    }
    if (current.type === "TSConditionalType" && descendant === current.trueType) {
      collectInferTypeParameterNames(current.extendsType, visitorKeys, names);
    }
    descendant = current;
    current = current.parent;
  }
  return names;
}
