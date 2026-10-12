import { tester } from "@murugappan/tooling/oxlint/rule-tester.ts";

import { preferEffectMatchRule } from "./prefer-effect-match.ts";

tester.run("prefer-effect-match", preferEffectMatchRule, {
  valid: [
    'kind === "a" ? first : fallback;',
    'kind === "a" ? first : other === "b" ? second : fallback;',
    "condition ? first : otherCondition ? second : fallback;"
  ],
  invalid: [
    {
      code: 'kind === "a" ? first : kind === "b" ? second : fallback;',
      errors: [{ messageId: "preferMatch" }]
    },
    {
      code: "`a` !== kind ? first : `b` === kind ? second : fallback;",
      errors: [{ messageId: "preferMatch" }]
    }
  ]
});
