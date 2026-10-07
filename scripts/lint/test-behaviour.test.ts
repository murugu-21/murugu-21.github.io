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
    }
  ]
});
