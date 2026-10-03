// Oxlint JS plugin enforcing AGENTS.md › Tests: a test must call the code under
// test and compare what it observes against an independent expected value.
// Heuristic by design: it catches the shapes syntax can decide and leaves the
// rest (and the documented exceptions) to an `oxlint-disable` with a reason.
import type { RuleTester } from "oxlint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type CallExpression = Parameters<NonNullable<Visitor["CallExpression"]>>[0];
type Node = CallExpression["parent"];

const TEST_FNS = new Set(["it", "test"]);
const TEST_MODIFIERS = new Set(["only", "concurrent", "sequential", "fails"]);
const TABLE_MODIFIERS = new Set(["each", "for"]);
// Imports that are test scaffolding rather than the code under test.
const HELPER_SOURCE = /(^|\/)(fixtures|helpers?|test-utils?|apply-migrations)(\.ts)?$/;
const COMPARISONS = new Set([
  "toBeGreaterThan",
  "toBeGreaterThanOrEqual",
  "toBeLessThan",
  "toBeLessThanOrEqual"
]);
const VALUE_MATCHERS = new Set([
  "toBe",
  "toEqual",
  "toStrictEqual",
  "toMatchObject",
  "toContain",
  "toContainEqual",
  "toMatch",
  "toBeCloseTo",
  "toHaveLength",
  "toHaveProperty",
  "toThrow",
  "toThrowError",
  "toHaveBeenCalledWith",
  "toHaveBeenLastCalledWith",
  "toHaveBeenNthCalledWith",
  "toMatchInlineSnapshot",
  ...COMPARISONS
]);

type ImportKind = "subject" | "helper";

// `cloudflare:test` exports SELF and env, which are how tests reach the Worker.
const isLocalSource = (source: string) =>
  source.startsWith(".") || source.startsWith("@/") || source.startsWith("cloudflare:");

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

function children(node: Node): { child: Node; key: string }[] {
  const out: { child: Node; key: string }[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (isNode(item)) out.push({ child: item, key });
    }
  }
  return out;
}

function containsNode(node: Node, match: (node: Node, key: string) => boolean, key = ""): boolean {
  if (match(node, key)) return true;
  return children(node).some(({ child, key: childKey }) => containsNode(child, match, childKey));
}

// `a.b.c` and `a().b` → `a`.
function rootName(node: Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootName(node.object);
  if (node.type === "CallExpression") return rootName(node.callee);
  if (node.type === "ChainExpression" || node.type === "TSNonNullExpression") {
    return rootName(node.expression);
  }
  return undefined;
}

function enclosingFunctionBody(node: Node): Node | undefined {
  for (let n: Node | null = node.parent; n; n = "parent" in n ? n.parent : null) {
    if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") {
      return n.body ?? undefined;
    }
  }
  return undefined;
}

// An identifier in a value position (not `x.name` or `{ name: … }`).
const isReference = (node: Node, key: string): node is Extract<Node, { type: "Identifier" }> =>
  node.type === "Identifier" &&
  !(key === "property" && node.parent.type === "MemberExpression" && !node.parent.computed) &&
  !(key === "key" && node.parent.type === "Property" && !node.parent.computed);

// The names a declaration or assignment target binds: `x`, `{ a, b: c }`, `[d, ...e]`.
function boundNames(target: Node, key = ""): string[] {
  if (isReference(target, key)) return [target.name];
  return children(target)
    .filter(({ key: childKey }) => childKey !== "right")
    .flatMap(({ child, key: childKey }) => boundNames(child, childKey));
}

// The initialiser of `const name = …` declared anywhere inside `scope`.
function declaredIn(scope: Node, name: string): Node | undefined {
  let init: Node | undefined;
  containsNode(scope, n => {
    if (n.type !== "VariableDeclarator" || !n.init || !boundNames(n.id).includes(name))
      return false;
    init = n.init;
    return true;
  });
  return init;
}

const isTestFn = (node: Node) => node.type === "Identifier" && TEST_FNS.has(node.name);
// `it.only`, `test.each`: a test function with a modifier from `names`.
const isModified = (node: Node, names: Set<string>) =>
  node.type === "MemberExpression" &&
  isTestFn(node.object) &&
  node.property.type === "Identifier" &&
  names.has(node.property.name);

// `it(…)`, `it.only(…)` and `it.each(table)(…)` → the test's callback.
function testCallback(call: CallExpression): Node | undefined {
  const { callee } = call;
  const isTest =
    isTestFn(callee) ||
    isModified(callee, TEST_MODIFIERS) ||
    (callee.type === "CallExpression" && isModified(callee.callee, TABLE_MODIFIERS));
  if (!isTest) return undefined;
  return call.arguments.find(
    arg => arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression"
  );
}

type Assertion = { subject: Node; matcher: string; negated: boolean; args: Node[] };

// `expect(x).not.resolves.toBe(y)` → { subject: x, matcher: "toBe", negated, args: [y] }.
function assertionAt(call: CallExpression): Assertion | undefined {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return undefined;
  const modifiers: string[] = [];
  let object: Node = callee.object;
  while (object.type === "MemberExpression" && object.property.type === "Identifier") {
    modifiers.push(object.property.name);
    object = object.object;
  }
  if (object.type !== "CallExpression" || object.callee.type !== "Identifier") return undefined;
  if (object.callee.name !== "expect") return undefined;
  const subject = object.arguments[0];
  if (subject === undefined) return undefined;
  return {
    subject,
    matcher: callee.property.name,
    negated: modifiers.includes("not"),
    args: call.arguments
  };
}

// `null`, `undefined`, `[]`, `{}`: the shapes that also match "returned nothing".
function isEmptyValue(node: Node): boolean {
  if (node.type === "Literal") return node.value === null;
  if (node.type === "Identifier") return node.name === "undefined";
  if (node.type === "ArrayExpression") return node.elements.length === 0;
  if (node.type === "ObjectExpression") return node.properties.length === 0;
  return false;
}

const isZero = (node: Node) => node.type === "Literal" && node.value === 0;

export default {
  meta: { name: "tests" },
  rules: {
    "observe-behaviour": {
      meta: {
        type: "problem",
        docs: { description: "Tests must observe behaviour (AGENTS.md › Tests)." },
        messages: {
          noSubjectCall:
            "This test never calls the code under test in its body, so it cannot fail for a defect. Call the subject with a concrete input here (see AGENTS.md › Tests).",
          noStrongAssertion:
            "No assertion here would fail if the code under test returned undefined. Compare the observed output against a literal expected value (see AGENTS.md › Tests)."
        }
      },
      create(context) {
        const imports = new Map<string, ImportKind>();
        // What each local name holds: a function's body, a declaration's
        // initialiser, or the setup that assigned it.
        const locals = new Map<string, Node>();
        const tests: { node: CallExpression; callback: Node }[] = [];
        let cachedSubjectNames: Set<string> | undefined;

        const isLocalImport = (node: Node) =>
          node.type === "ImportExpression" &&
          node.source.type === "Literal" &&
          typeof node.source.value === "string" &&
          isLocalSource(node.source.value);
        const reachesSubject = (node: Node, names: Set<string>) =>
          containsNode(
            node,
            (n, key) => isLocalImport(n) || (isReference(n, key) && names.has(n.name))
          );

        // Imports, plus every local that leads back to one. Helper imports count
        // too: `fetchWorker` from ./fixtures is how a test drives the Worker.
        const subjectNames = (): Set<string> => {
          if (cachedSubjectNames) return cachedSubjectNames;
          const names = new Set(imports.keys());
          let grew = true;
          while (grew) {
            grew = false;
            for (const [name, value] of locals) {
              if (names.has(name) || !reachesSubject(value, names)) continue;
              names.add(name);
              grew = true;
            }
          }
          cachedSubjectNames = names;
          return names;
        };

        // `toBe(f(a))`, `toBe(buildUrl(…))`, or `toBe(want)` after `const want = f(a)`
        // in the same test: the expected value is computed by the code under test.
        // Reading one of its constants is fine.
        const callsSubject = (node: Node, test: Node): boolean =>
          containsNode(node, (n, key) => {
            if (isReference(n, key)) {
              const value = declaredIn(test, n.name);
              return value !== undefined && value !== node && callsSubject(value, test);
            }
            if (n.type !== "CallExpression" && n.type !== "NewExpression") return false;
            const name = rootName(n.callee);
            return name !== undefined && subjectNames().has(name);
          });
        // `expect(LIMITS.maxTools)`: reads a constant without running anything.
        const isConstantPin = (node: Node) => {
          const name = rootName(node);
          return (
            name !== undefined &&
            imports.get(name) === "subject" &&
            !containsNode(node, n => n.type === "CallExpression")
          );
        };

        const isStrong = ({ subject, matcher, negated, args }: Assertion, test: Node) => {
          if (negated || !VALUE_MATCHERS.has(matcher) || isConstantPin(subject)) return false;
          const expected = matcher === "toHaveProperty" ? args[1] : args[0];
          if (expected === undefined || isEmptyValue(expected)) return false;
          if ((matcher === "toHaveLength" || COMPARISONS.has(matcher)) && isZero(expected)) {
            return false;
          }
          return !callsSubject(expected, test);
        };

        // Follows calls into local helpers, so `check(1, 2)` counts when
        // `check` holds the `expect`.
        const hasStrongAssertion = (body: Node, seen = new Set<string>()): boolean =>
          containsNode(body, node => {
            if (node.type !== "CallExpression") return false;
            const assertion = assertionAt(node);
            if (assertion) return isStrong(assertion, body);
            if (node.callee.type !== "Identifier" || seen.has(node.callee.name)) return false;
            const helper = locals.get(node.callee.name);
            seen.add(node.callee.name);
            return helper !== undefined && hasStrongAssertion(helper, seen);
          });

        return {
          ImportDeclaration(node) {
            if (node.importKind === "type") return;
            const source = node.source.value;
            if (!isLocalSource(source)) return;
            const kind: ImportKind = HELPER_SOURCE.test(source) ? "helper" : "subject";
            for (const specifier of node.specifiers) {
              if (specifier.type === "ImportSpecifier" && specifier.importKind === "type") continue;
              imports.set(specifier.local.name, kind);
            }
          },
          FunctionDeclaration(node) {
            if (node.id && node.body) locals.set(node.id.name, node.body);
          },
          VariableDeclaration(node) {
            // `declare const __GLOBAL_CSS__`: build-time input injected by vitest.config.ts.
            if (!node.declare) return;
            for (const { id } of node.declarations) {
              for (const name of boundNames(id)) imports.set(name, "subject");
            }
          },
          VariableDeclarator(node) {
            if (!node.init) return;
            for (const name of boundNames(node.id)) locals.set(name, node.init);
          },
          // `let x; beforeAll(() => { …subject…; x = … })`: x carries whatever the
          // enclosing setup ran, not just its right-hand side.
          AssignmentExpression(node) {
            const scope = enclosingFunctionBody(node) ?? node.right;
            for (const name of boundNames(node.left)) locals.set(name, scope);
          },
          CallExpression(node) {
            const callback = testCallback(node);
            if (callback) tests.push({ node, callback });
          },
          // Checked once the whole file is collected, so helpers declared below
          // a test still count.
          "Program:exit"() {
            for (const { node, callback } of tests) {
              if (!reachesSubject(callback, subjectNames())) {
                context.report({ node, messageId: "noSubjectCall" });
                continue;
              }
              if (!hasStrongAssertion(callback)) {
                context.report({ node, messageId: "noStrongAssertion" });
              }
            }
          }
        };
      }
    }
  }
} satisfies { meta: { name: string }; rules: Record<string, Rule> };
