// Oxlint JS plugin for apps/api/README.md › Layers: every method a service or repository layer
// provides is an Effect.fn, so each call gets a span named after the method.
import type { NodeOf, Plugin } from "./plugin-types.ts";

type ObjectExpression = NodeOf<"ObjectExpression">;
type Node = ObjectExpression["parent"];
type CallExpression = Extract<Node, { type: "CallExpression" }>;

const isFunction = (node: Node) =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

const LAYER_CONSTRUCTORS = new Set(["effect", "succeed", "sync"]);

// `Layer.effect(Service, …)`, `Layer.succeed(Service, …)` or `Layer.sync(Service, …)`. A service
// that isn't a plain identifier is skipped, since the message has no name to give the span.
function layerService(call: CallExpression): string | undefined {
  const { callee, arguments: args } = call;
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return undefined;
  if (callee.object.type !== "Identifier" || callee.object.name !== "Layer") return undefined;
  if (!LAYER_CONSTRUCTORS.has(callee.property.name)) return undefined;
  return args[0]?.type === "Identifier" ? args[0].name : undefined;
}

// The function whose result `node` is: an arrow's expression body, or a `return` argument.
function returnedFrom(node: Node): Node | undefined {
  const { parent } = node;
  if (parent?.type === "ArrowFunctionExpression") return parent.body === node ? parent : undefined;
  if (parent?.type !== "ReturnStatement") return undefined;
  for (let n: Node | null = parent; n; n = n.parent) {
    if (isFunction(n)) return n;
  }
  return undefined;
}

// The service whose layer provides `node`: the implementation passed to a Layer constructor,
// or what a build function passed to it returns, as in
// `Layer.effect(S, Effect.gen(function* () { return { … } }))` or `Layer.sync(S, () => ({ … }))`.
function providedBy(node: Node): string | undefined {
  const { parent } = node;
  if (parent?.type === "CallExpression" && parent.arguments[1] === node) {
    const service = layerService(parent);
    if (service) return service;
  }
  const build = returnedFrom(node);
  const call = build?.parent;
  if (!build || call?.type !== "CallExpression" || !call.arguments.some(arg => arg === build)) {
    return undefined;
  }
  return providedBy(build) ?? providedBy(call);
}

export default {
  meta: { name: "effect" },
  rules: {
    "use-fn": {
      meta: {
        type: "suggestion",
        docs: {
          description: "Each method a service or repository layer provides is an Effect.fn."
        },
        messages: {
          useFn:
            'Wrap {{name}} in Effect.fn("{{service}}.{{name}}")(function* (…) { … }) so every call gets a span, or in Effect.fnUntraced on a hot path (apps/api/README.md › Layers).'
        }
      },
      create(context) {
        return {
          ObjectExpression(node) {
            const service = providedBy(node);
            if (!service) return;
            for (const property of node.properties) {
              if (property.type !== "Property" || !isFunction(property.value)) continue;
              const { key } = property;
              const name = key.type === "Identifier" ? key.name : context.sourceCode.getText(key);
              context.report({ node: property, messageId: "useFn", data: { name, service } });
            }
          }
        };
      }
    }
  }
} satisfies Plugin;
