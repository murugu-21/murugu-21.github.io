import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./test-behaviour.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

const SUBJECT_IMPORT = 'import { LIMIT, slugify, TOOLS } from "./subject";\n';
const WIDGET_IMPORT =
  'import { render } from "vitest-browser-react";\nimport { Widget } from "./Widget";\n';
const TSX = { parserOptions: { lang: "tsx" } } as const;

tester.run("observe-behaviour", plugin.rules["observe-behaviour"], {
  valid: [
    {
      name: "a literal expected value",
      code: `${SUBJECT_IMPORT}it("slugs", () => { expect(slugify("Hi There")).toBe("hi-there"); });`
    },
    {
      name: "a constant as input, a literal as expected",
      code: `${SUBJECT_IMPORT}it("caps", () => { expect(slugify("x".repeat(LIMIT + 1))).toHaveLength(20); });`
    },
    {
      name: "two observations compared against each other, next to a literal",
      code: `${SUBJECT_IMPORT}it("ignores case", () => {
  const first = slugify("A");
  expect(first).toBe("a");
  expect(slugify("a")).toBe(first);
});`
    },
    {
      name: "a subject constant as the input of an observed call in the expected value",
      code: `${SUBJECT_IMPORT}it("matches the versioned path", () => {
  expect(slugify("/v1")).toBe("v1");
  expect(slugify("/")).toBe(slugify(\`/\${LIMIT}\`));
});`
    },
    {
      name: "a method call on a subject import in the expected value",
      code: `${SUBJECT_IMPORT}it("matches the app", () => {
  expect(slugify("A")).toBe("a");
  expect(slugify("b")).toBe(TOOLS.lookup("b"));
});`
    },
    {
      name: "a subject error class passed to toThrow",
      code: `${SUBJECT_IMPORT}it("rejects", () => { expect(() => slugify("")).toThrow(LIMIT); });`
    },
    {
      name: "subject calls in the rows of an it.each table",
      code: `${SUBJECT_IMPORT}it.each([[() => slugify("A")]])("slugs", run => { expect(run()).toBe("a"); });`
    },
    {
      name: "the cloudflare:test harness in the expected value",
      code: `import { env, SELF } from "cloudflare:test";
it("echoes the inbox", async () => {
  const res = await SELF.fetch("https://x/inbox");
  expect(await res.text()).toBe(env.INBOX);
});`
    },
    {
      name: "a string key that isn't an identifier",
      code: `${SUBJECT_IMPORT}it("reads a header", () => { expect(slugify("a")["content-type"]).toBe("text/plain"); });`
    },
    {
      name: "an assertion in a helper function declared below the test",
      code: `${SUBJECT_IMPORT}it("slugs", () => { check("A", "a"); });
function check(input: string, want: string) { expect(slugify(input)).toBe(want); }`
    },
    {
      name: "a value assigned in a beforeAll setup that runs the subject",
      code: `${SUBJECT_IMPORT}let page: string;
beforeAll(() => { slugify("warm up"); page = "a"; });
it("slugs", () => { expect(page).toHaveProperty("length", 1); });`
    },
    {
      name: "the subject reached through a dynamic import in the test",
      code: `it("slugs", async () => {
  const { slugify: run, LIMIT: [first, ...rest] } = await import("./subject");
  expect({ [first]: run("A"), rest }).toEqual({ a: "a", rest: [] });
});`
    },
    {
      name: "an expected value assigned in a cycle",
      code: `${SUBJECT_IMPORT}let a: string;
let b: string;
a = b;
b = a;
it("slugs", () => { expect(slugify("x")).toBe(a); });`
    },
    {
      name: "rendering a component and asserting what it shows",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("greets", async () => {
  const screen = await render(<Widget name="Ada" />);
  await expect.element(screen.getByRole("heading", { name: "Hi Ada" })).toBeVisible();
});`
    },
    {
      name: "a polled value against a literal",
      code: `${SUBJECT_IMPORT}it("settles", async () => { await expect.poll(() => slugify("A")).toBe("a"); });`
    },
    {
      name: "a rendered attribute against a literal",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("links", async () => {
  const screen = await render(<Widget name="Ada" />);
  await expect.element(screen.getByRole("link")).toHaveAttribute("href", "/ada");
});`
    }
  ],
  invalid: [
    {
      name: "a polled subject constant",
      code: `${SUBJECT_IMPORT}it("caps", async () => {
  await expect.poll(() => LIMIT).toBe(3);
  await expect.poll(function () { return TOOLS.max; }).toBe(8);
});`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "a harness binding read straight into expect",
      code: `import { env } from "cloudflare:test";
it("has an inbox", () => { expect(env.INBOX).toBe("x"); });`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "a rendered-state matcher on a plain expect",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("greets", async () => {
  const screen = await render(<Widget name="Ada" />);
  expect(screen.getByText("Hi Ada")).toBeVisible();
});`,
      errors: [{ messageId: "noStrongAssertion", line: 3 }]
    },
    {
      name: "an element value matcher on a plain expect",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("links", async () => {
  const screen = await render(<Widget name="Ada" />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "/ada");
});`,
      errors: [{ messageId: "noStrongAssertion", line: 3 }]
    },
    {
      name: "a component test that only asserts an absence",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("hides", async () => {
  const screen = await render(<Widget name="Ada" />);
  await expect.element(screen.getByText("Error")).not.toBeInTheDocument();
});`,
      errors: [{ messageId: "noStrongAssertion", line: 3 }]
    },
    {
      name: "a component test that renders something other than the subject",
      languageOptions: TSX,
      code: `${WIDGET_IMPORT}it("greets", async () => {
  const screen = await render(<div>Hi</div>);
  await expect.element(screen.getByText("Hi")).toBeVisible();
});`,
      errors: [{ messageId: "noSubjectCall", line: 3 }]
    },
    {
      name: "a test that never calls the subject",
      code: `${SUBJECT_IMPORT}it("adds", () => { expect(1 + 1).toBe(2); });`,
      errors: [{ messageId: "noSubjectCall", line: 2 }]
    },
    {
      name: "only a weak assertion",
      code: `${SUBJECT_IMPORT}it("slugs", () => { expect(slugify("a")).not.toBe("b"); });`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "an expected value read from a subject constant, beside a strong assertion",
      code: `${SUBJECT_IMPORT}it("lists tools", () => {
  expect(slugify("A")).toBe("a");
  expect(slugify("tools")).toEqual(TOOLS.map(t => t.name));
});`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "TOOLS" }, line: 4 }]
    },
    {
      name: "a subject constant reached through a top-level const",
      code: `${SUBJECT_IMPORT}const WANT = \`\${LIMIT};w=60\`;
it("reports the policy", () => { expect(slugify("p")).toBe(WANT); });`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "LIMIT" }, line: 3 }]
    },
    {
      name: "a subject constant reached through a describe-level const",
      code: `${SUBJECT_IMPORT}describe("tools", () => {
  const NAMES = TOOLS.map(t => t.name);
  it("lists them", () => { expect(slugify("tools")).toEqual(NAMES); });
});`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "TOOLS" }, line: 4 }]
    },
    {
      name: "a private member read by string key",
      code: `${SUBJECT_IMPORT}it("emails once", async () => {
  const room = slugify("r");
  await room["emailOnce"]();
  expect(slugify("a")).toBe("a");
});`,
      errors: [{ messageId: "stringKeyAccess", data: { name: "emailOnce" }, line: 4 }]
    },
    {
      name: "an expected value computed by the subject",
      code: `${SUBJECT_IMPORT}it("slugs", () => {
  const want = slugify("a");
  expect(slugify("A")).toBe(want);
  expect(slugify("B")).toBe(slugify("b"));
});`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "only absences and empty values",
      code: `${SUBJECT_IMPORT}it("is empty", () => {
  expect(slugify("")).toHaveLength(0);
  expect(slugify(" ")).toEqual([]);
  expect(slugify("  ")).toEqual({});
  expect(slugify("   ")).toBeNull();
  expect(slugify("    ")).toBeGreaterThan(0);
});`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "a subject constant read through optional chaining and a non-null assertion",
      code: `${SUBJECT_IMPORT}it("caps", () => {
  expect(TOOLS?.max).toBe(8);
  expect(TOOLS!.min).toBe(1);
});`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "a subject constant assigned at the top level",
      code: `${SUBJECT_IMPORT}let want: string;
want = TOOLS.name;
it("names", () => { expect(slugify("tools")).toBe(want); });`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "TOOLS" }, line: 4 }]
    },
    {
      name: "a test that reads only type-only imports",
      code: `import type { Options } from "./subject";
import { type Mode } from "./subject";
it("types", () => { expect((1 satisfies Mode) satisfies Options).toBe(1); });`,
      errors: [{ messageId: "noSubjectCall", line: 3 }]
    },
    {
      name: "a subject constant destructured at the top level",
      code: `${SUBJECT_IMPORT}const { max: [first] } = TOOLS;
it("caps", () => { expect(slugify("a")).toBe(first); });`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "TOOLS" }, line: 3 }]
    },
    {
      name: "a subject constant as a computed key",
      code: `${SUBJECT_IMPORT}const WANTS = { a: "a" };
it("slugs", () => { expect(slugify("A")).toBe(WANTS[LIMIT]); });`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "LIMIT" }, line: 3 }]
    }
  ]
});
