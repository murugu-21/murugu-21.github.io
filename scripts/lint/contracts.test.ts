import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import plugin from "./contracts.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });

const exported = (name: string) => ({ messageId: "exportedBehaviour", data: { name } });

tester.run("shapes-only", plugin.rules["shapes-only"], {
  valid: [
    {
      name: "schemas, types and constants",
      code: `import { z } from "zod";
export const Message = z.object({ text: z.string() });
export type Message = z.infer<typeof Message>;
export interface Limits { max: number }
export const LIMITS = { max: 8 };
const ROUTES = ["/a"];
export { ROUTES, ROUTES as PATHS };
export default LIMITS;`
    },
    {
      name: "a function kept private, and a re-export of a name also declared locally",
      code: `const helper = () => 1;
export const ONE = helper();
function build() {}
export { build } from "./build";
export * from "./other";`
    }
  ],
  invalid: [
    {
      name: "every way to export a function or class",
      code: `export function parse() {}
export const build = () => 1;
export const make = function () {};
export class Store {}
export const Model = class {};
const local = () => 2;
function named() {}
class Box {}
export { local, named as renamed, Box };`,
      errors: [
        { ...exported("parse"), line: 1 },
        { ...exported("build"), line: 2 },
        { ...exported("make"), line: 3 },
        { ...exported("Store"), line: 4 },
        { ...exported("Model"), line: 5 },
        { ...exported("local"), line: 9 },
        { ...exported("named"), line: 9 },
        { ...exported("Box"), line: 9 }
      ]
    },
    {
      name: "a default export of a function",
      code: `export default function () {}`,
      errors: [{ ...exported("the default export"), line: 1 }]
    },
    {
      name: "a default export of a name bound to an arrow declared below it",
      code: `export default handler;
const handler = () => 1;`,
      errors: [{ ...exported("handler"), line: 1 }]
    }
  ]
});
