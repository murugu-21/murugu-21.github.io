// Oxlint JS plugin for the AGENTS.md "Test behaviour, not implementation" rule.
// A test must call the code under test and compare what it observes against an
// independent expected value. The rule is a heuristic by design. It catches the
// shapes syntax can decide and leaves the rest (and the documented exceptions)
// to an `oxlint-disable` with a reason.
import type { RuleTester } from "vite-plus/lint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
type Rule = Parameters<RuleTester["run"]>[1];
type Context = Parameters<NonNullable<Rule["create"]>>[0];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type NodeOf<K extends keyof Visitor> = Parameters<NonNullable<Visitor[K]>>[0];
type CallExpression = NodeOf<"CallExpression">;
type Node = CallExpression["parent"];
type Identifier = Extract<Node, { type: "Identifier" }>;

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
// Value matchers that compare what `expect.element(locator)` finds once it renders.
const ELEMENT_VALUE_MATCHERS = new Set([
  "toHaveTextContent",
  "toHaveAttribute",
  "toHaveClass",
  "toHaveValue",
  "toHaveAccessibleName"
]);
// On `expect.element(locator)` these fail when the component renders nothing.
const RENDERED_STATE_MATCHERS = new Set([
  "toBeVisible",
  "toBeInTheDocument",
  "toBeEnabled",
  "toBeDisabled",
  "toBeChecked"
]);

// `harness` is `cloudflare:test`, whose SELF and env are how tests reach the Worker.
type ImportKind = "subject" | "helper" | "harness";

const isLocalSource = (source: string) =>
  source.startsWith(".") || source.startsWith("#") || source.startsWith("cloudflare:");

function importKind(source: string): ImportKind {
  if (source.startsWith("cloudflare:")) return "harness";
  return HELPER_SOURCE.test(source) ? "helper" : "subject";
}

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && "type" in value && typeof value.type === "string";

const isCall = (node: Node) => node.type === "CallExpression" || node.type === "NewExpression";

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

// The root identifier of `a.b.c` or `a().b`, which is `a`.
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

// The slots where an identifier names a member (`x.name`, `{ name: … }`) unless computed.
const MEMBER_NAME_SLOTS = new Map([
  ["property", "MemberExpression"],
  ["key", "Property"]
]);

// An identifier in a value position, which reads a variable.
function isReference(node: Node, key: string): node is Identifier {
  if (node.type !== "Identifier") return false;
  const { parent } = node;
  return MEMBER_NAME_SLOTS.get(key) !== parent.type || ("computed" in parent && parent.computed);
}

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
// `it.only` or `test.each`, a test function with a modifier from `names`.
const isModified = (node: Node, names: Set<string>) =>
  node.type === "MemberExpression" &&
  isTestFn(node.object) &&
  node.property.type === "Identifier" &&
  names.has(node.property.name);

// `table` is the rows of `it.each(table)(…)`, which may hold the calls.
type Test = { node: CallExpression; callback: Node; table?: Node };

// A test from `it(…)`, `it.only(…)` or `it.each(table)(…)`.
function testAt(call: CallExpression): Test | undefined {
  const { callee } = call;
  const isTable = callee.type === "CallExpression" && isModified(callee.callee, TABLE_MODIFIERS);
  if (!isTable && !isTestFn(callee) && !isModified(callee, TEST_MODIFIERS)) return undefined;
  const callback = call.arguments.find(
    arg => arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression"
  );
  if (!callback) return undefined;
  return { node: call, callback, table: isTable ? callee.arguments[0] : undefined };
}

type Assertion = {
  subject: Node;
  matcher: string;
  negated: boolean;
  args: Node[];
  onElement: boolean;
};

// `expect`, `expect.poll` or `expect.element`, the last two returning the variant's name.
function expectVariant(callee: Node): "expect" | "poll" | "element" | undefined {
  if (callee.type === "Identifier") return callee.name === "expect" ? "expect" : undefined;
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return undefined;
  if (callee.object.name !== "expect" || callee.property.type !== "Identifier") return undefined;
  const { name } = callee.property;
  return name === "poll" || name === "element" ? name : undefined;
}

// What `expect.poll(() => x)` observes: x, when the callback only returns it.
function polledValue(fn: Node): Node {
  if (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression") return fn;
  const { body } = fn;
  if (!body) return fn;
  if (body.type !== "BlockStatement") return body;
  const [only, ...rest] = body.body;
  return only?.type === "ReturnStatement" && only.argument && rest.length === 0
    ? only.argument
    : fn;
}

// Parses `expect(x).not.resolves.toBe(y)` into { subject: x, matcher: "toBe", negated, args: [y] }.
function assertionAt(call: CallExpression): Assertion | undefined {
  const { callee } = call;
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return undefined;
  const modifiers: string[] = [];
  let object: Node = callee.object;
  while (object.type === "MemberExpression" && object.property.type === "Identifier") {
    modifiers.push(object.property.name);
    object = object.object;
  }
  if (object.type !== "CallExpression") return undefined;
  const variant = expectVariant(object.callee);
  if (!variant) return undefined;
  const subject = object.arguments[0];
  if (subject === undefined) return undefined;
  return {
    subject: variant === "poll" ? polledValue(subject) : subject,
    matcher: callee.property.name,
    negated: modifiers.includes("not"),
    args: call.arguments,
    onElement: variant === "element"
  };
}

// `null`, `undefined`, `[]` and `{}`, the shapes that also match "returned nothing".
function isEmptyValue(node: Node): boolean {
  if (node.type === "Literal") return node.value === null;
  if (node.type === "Identifier") return node.name === "undefined";
  if (node.type === "ArrayExpression") return node.elements.length === 0;
  if (node.type === "ObjectExpression") return node.properties.length === 0;
  return false;
}

const isZero = (node: Node) => node.type === "Literal" && node.value === 0;

const expectedOf = ({ matcher, args }: Assertion): Node | undefined =>
  matcher === "toHaveProperty" ? args[1] : args[0];

const isValueMatcher = ({ matcher, onElement }: Assertion) =>
  VALUE_MATCHERS.has(matcher) || (onElement && ELEMENT_VALUE_MATCHERS.has(matcher));

// `TOOLS.map(…)` reads TOOLS as data. `api.request(…)` calls into the code under test.
const DATA_METHODS = new Set([
  "at",
  "concat",
  "entries",
  "every",
  "filter",
  "find",
  "flatMap",
  "includes",
  "join",
  "keys",
  "map",
  "reduce",
  "slice",
  "some",
  "toSorted",
  "values"
]);

// `f(…)` or `x.method(…)`, where `n` is `f` or `x` and the method isn't a DATA_METHOD.
function isCalled(n: Node, key: string): boolean {
  const parent: Node | null = n.parent;
  if (!parent) return false;
  if (isCall(parent)) return key === "callee";
  if (parent.type !== "MemberExpression" || key !== "object") return false;
  const call: Node | null = parent.parent;
  if (call?.type !== "CallExpression" || call.callee !== parent) return false;
  const { callee } = call;
  return (
    callee.type === "MemberExpression" &&
    !(callee.property.type === "Identifier" && DATA_METHODS.has(callee.property.name))
  );
}

// What the visitors collect from one file. `locals` maps each local name to
// what it holds: a function's body, a declaration's initialiser, or the setup
// that assigned it.
type Facts = { imports: Map<string, ImportKind>; locals: Map<string, Node>; tests: Test[] };
// `subjects` is every import plus every local that leads back to one. Helper
// imports count too: `fetchWorker` from ./fixtures is how a test drives the Worker.
type FileModel = Facts & { subjects: Set<string> };

const isLocalImport = (node: Node) =>
  node.type === "ImportExpression" &&
  node.source.type === "Literal" &&
  typeof node.source.value === "string" &&
  isLocalSource(node.source.value);

// `<Widget />` renders, and so calls, the component it names.
const rendersSubject = (node: Node, names: Set<string>) =>
  node.type === "JSXOpeningElement" &&
  node.name.type === "JSXIdentifier" &&
  names.has(node.name.name);

const reachesSubject = (node: Node, names: Set<string>) =>
  containsNode(
    node,
    (n, key) =>
      isLocalImport(n) || rendersSubject(n, names) || (isReference(n, key) && names.has(n.name))
  );

function modelOf(facts: Facts): FileModel {
  const subjects = new Set(facts.imports.keys());
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, value] of facts.locals) {
      if (subjects.has(name) || !reachesSubject(value, subjects)) continue;
      subjects.add(name);
      grew = true;
    }
  }
  return { ...facts, subjects };
}

const callsInto = (node: Node, file: FileModel) =>
  isCall(node) && file.subjects.has(rootName(node.callee) ?? "");

// `toBe(f(a))`, `toBe(buildUrl(…))`, or `toBe(want)` after `const want = f(a)`
// in the same test. In each, the code under test computes the expected value.
function callsSubject({
  node,
  scope,
  file
}: {
  node: Node;
  scope: Node;
  file: FileModel;
}): boolean {
  return containsNode(node, (n, key) => {
    if (!isReference(n, key)) return callsInto(n, file);
    const value = declaredIn(scope, n.name);
    return value !== undefined && value !== node && callsSubject({ node: value, scope, file });
  });
}

// `expect(LIMITS.maxTools)` or `expect(env.INBOX)` reads a value without running anything.
function isConstantPin(node: Node, file: FileModel) {
  const kind = file.imports.get(rootName(node) ?? "");
  return (
    (kind === "subject" || kind === "harness") &&
    !containsNode(node, n => n.type === "CallExpression")
  );
}

// The identifiers `node` reads as data. Calls into the subject are
// observations, so their arguments are input, not data.
function dataReferences(node: Node, file: FileModel, key = ""): Identifier[] {
  if (isReference(node, key)) return isCalled(node, key) ? [] : [node];
  const observes = callsInto(node, file);
  return children(node)
    .filter(({ key: childKey }) => !(observes && childKey === "arguments"))
    .flatMap(({ child, key: childKey }) => dataReferences(child, file, childKey));
}

// The subject import an expected value reads as data, directly or through a const.
function subjectSource({
  expected,
  scope,
  file
}: {
  expected: Node;
  scope: Node;
  file: FileModel;
}) {
  const seen = new Set<string>();
  const visit = (node: Node): string | undefined => {
    for (const { name } of dataReferences(node, file)) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (file.imports.get(name) === "subject") return name;
      const value = declaredIn(scope, name) ?? file.locals.get(name);
      const found = value && value !== expected ? visit(value) : undefined;
      if (found) return found;
    }
    return undefined;
  };
  return visit(expected);
}

type Found = { node: CallExpression; assertion: Assertion; scope: Node };

// Every assertion in a test, following calls into local helpers, so
// `check(1, 2)` counts when `check` holds the `expect`.
function assertionsIn(body: Node, file: FileModel, seen = new Set<string>()): Found[] {
  const out: Found[] = [];
  containsNode(body, node => {
    if (node.type !== "CallExpression") return false;
    const assertion = assertionAt(node);
    if (assertion) {
      out.push({ node, assertion, scope: body });
      return false;
    }
    if (node.callee.type !== "Identifier" || seen.has(node.callee.name)) return false;
    seen.add(node.callee.name);
    const helper = file.locals.get(node.callee.name);
    if (helper) out.push(...assertionsIn(helper, file, seen));
    return false;
  });
  return out;
}

type Candidate = { assertion: Assertion; expected: Node; scope: Node; file: FileModel };

// The AGENTS.md shapes of an assertion that still passes when the code under
// test returns undefined.
const WEAK_SHAPES: Record<string, (candidate: Candidate) => boolean> = {
  // `toBeDefined()`, `not.toBe(wrong)`
  weakMatcher: ({ assertion }) => assertion.negated || !isValueMatcher(assertion),
  // `toEqual([])`, `toBe(undefined)`
  emptyExpected: ({ expected }) => isEmptyValue(expected),
  // `toHaveLength(0)`, `toBeGreaterThan(0)`
  zeroBound: ({ assertion, expected }) =>
    (assertion.matcher === "toHaveLength" || COMPARISONS.has(assertion.matcher)) &&
    isZero(expected),
  constantPin: ({ assertion, file }) => isConstantPin(assertion.subject, file),
  selfReferential: ({ expected, scope, file }) => callsSubject({ node: expected, scope, file })
};

function isStrong({ assertion, scope }: Found, file: FileModel) {
  if (assertion.onElement && !assertion.negated && RENDERED_STATE_MATCHERS.has(assertion.matcher)) {
    return true;
  }
  const expected = expectedOf(assertion);
  if (expected === undefined) return false;
  return !Object.values(WEAK_SHAPES).some(weak => weak({ assertion, expected, scope, file }));
}

// The subject import an assertion's expected value restates, if any.
function expectedFromSubject({ assertion, scope }: Found, file: FileModel) {
  // `toThrow(SubjectError)` names the error class; it computes nothing.
  if (assertion.matcher.startsWith("toThrow") || !isValueMatcher(assertion)) {
    return undefined;
  }
  const expected = expectedOf(assertion);
  return expected && subjectSource({ expected, scope, file });
}

function reportTests(context: Context, facts: Facts) {
  const file = modelOf(facts);
  const reported = new Set<Node>();
  for (const { node, callback, table } of facts.tests) {
    const found = assertionsIn(callback, file);
    for (const each of found) {
      if (reported.has(each.node)) continue;
      const name = expectedFromSubject(each, file);
      if (!name) continue;
      reported.add(each.node);
      context.report({ node: each.node, messageId: "expectedFromSubject", data: { name } });
    }
    if (![callback, table].some(scope => scope && reachesSubject(scope, file.subjects))) {
      context.report({ node, messageId: "noSubjectCall" });
    } else if (!found.some(each => isStrong(each, file))) {
      context.report({ node, messageId: "noStrongAssertion" });
    }
  }
}

function importsOf(node: NodeOf<"ImportDeclaration">): [string, ImportKind][] {
  const source = node.source.value;
  if (node.importKind === "type" || !isLocalSource(source)) return [];
  const kind = importKind(source);
  return node.specifiers
    .filter(specifier => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type")
    .map(specifier => [specifier.local.name, kind]);
}

const functionBindings = ({ id, body }: NodeOf<"FunctionDeclaration">): [string, Node][] =>
  id && body ? [[id.name, body]] : [];

const declaratorBindings = ({ id, init }: NodeOf<"VariableDeclarator">): [string, Node][] =>
  init ? boundNames(id).map(name => [name, init]) : [];

// In `let x; beforeAll(() => { …subject…; x = … })`, x carries whatever the
// enclosing setup ran, not only its right-hand side.
function assignmentBindings(node: NodeOf<"AssignmentExpression">): [string, Node][] {
  const scope = enclosingFunctionBody(node) ?? node.right;
  return boundNames(node.left).map(name => [name, scope]);
}

function setAll<V>(map: Map<string, V>, entries: [string, V][]) {
  for (const [key, value] of entries) map.set(key, value);
}

// `x["emailOnce"]`, a member read by a string key that has a dot form.
function stringKeyOf({ computed, property }: NodeOf<"MemberExpression">) {
  if (!computed || property.type !== "Literal" || typeof property.value !== "string") {
    return undefined;
  }
  // `x["content-type"]` has no dot form, so it isn't dodging `private`.
  return /^[A-Za-z_$][\w$]*$/.test(property.value) ? property.value : undefined;
}

export default {
  meta: { name: "tests" },
  rules: {
    "observe-behaviour": {
      meta: {
        type: "problem",
        docs: { description: "Tests must observe behaviour (see the Tests section of AGENTS.md)." },
        messages: {
          noSubjectCall:
            "This test never calls the code under test in its body, so it cannot fail for a defect. Call the subject with a concrete input here (see the Tests section of AGENTS.md).",
          noStrongAssertion:
            "No assertion here would fail if the code under test returned undefined. Compare the observed output against a literal expected value (see the Tests section of AGENTS.md).",
          expectedFromSubject:
            "The expected value comes from `{{name}}` in the code under test, so it changes with the code and can't catch a defect. Write the literal value (see the Tests section of AGENTS.md).",
          stringKeyAccess:
            '`["{{name}}"]` reads a member by string key, which skips TypeScript\'s `private` check. Drive the code through its public API (see the Tests section of AGENTS.md).'
        }
      },
      create(context) {
        const facts: Facts = { imports: new Map(), locals: new Map(), tests: [] };
        return {
          ImportDeclaration: node => setAll(facts.imports, importsOf(node)),
          FunctionDeclaration: node => setAll(facts.locals, functionBindings(node)),
          VariableDeclarator: node => setAll(facts.locals, declaratorBindings(node)),
          AssignmentExpression: node => setAll(facts.locals, assignmentBindings(node)),
          MemberExpression(node) {
            const name = stringKeyOf(node);
            if (name) context.report({ node, messageId: "stringKeyAccess", data: { name } });
          },
          CallExpression(node) {
            const test = testAt(node);
            if (test) facts.tests.push(test);
          },
          // Checked once the whole file is collected, so helpers declared below
          // a test still count.
          "Program:exit": () => reportTests(context, facts)
        };
      }
    }
  }
} satisfies { meta: { name: string }; rules: Record<string, Rule> };
