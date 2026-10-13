import { RuleTester } from "vite-plus/lint/plugins-dev";
import { describe, it } from "vite-plus/test";

RuleTester.describe = describe;
RuleTester.it = it;

export const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
