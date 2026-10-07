import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./test-behaviour.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

const SUBJECT_IMPORT = 'import { LIMIT, slugify, TOOLS } from "./subject";\n';

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
      name: "a value a beforeAll setup assigns from the subject",
      code: `${SUBJECT_IMPORT}let page: string;
beforeAll(() => { page = slugify("A"); });
it("slugs", () => { expect(page).toHaveProperty("length", 1); });`
    },
    {
      name: "a value destructured from a dynamic import of the subject",
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
      name: "type-only imports beside a subject import",
      code: `import type { Options } from "./subject";
import { type Mode, slugify } from "./subject";
it("slugs", () => { expect(slugify("A") satisfies Mode).toBe("a"); });`
    }
  ],
  invalid: [
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
      name: "a build-time global declared in the test file",
      code: `declare const __GLOBAL_CSS__: string;
it("inlines the sheet", () => { expect(__GLOBAL_CSS__).toContain("body"); });`,
      errors: [{ messageId: "noStrongAssertion", line: 2 }]
    },
    {
      name: "a subject constant assigned at the top level",
      code: `${SUBJECT_IMPORT}let want: string;
want = TOOLS.name;
it("names", () => { expect(slugify("tools")).toBe(want); });`,
      errors: [{ messageId: "expectedFromSubject", data: { name: "TOOLS" }, line: 4 }]
    }
  ]
});
