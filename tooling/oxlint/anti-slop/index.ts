import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { noArrayFilterMapRule } from "./no-array-filter-map.ts";
import { noConditionalEmptyObjectSpreadRule } from "./no-conditional-empty-object-spread.ts";
import { noKnownValueWideningRule } from "./no-known-value-widening.ts";
import { noModuleMockingRule } from "./no-module-mocking.ts";
import { noObjectParametersRule } from "./no-object-parameters.ts";
import { noReduceAccumulatorCopyRule } from "./no-reduce-accumulator-copy.ts";
import { noReflectApplyRule } from "./no-reflect-apply.ts";
import { noReflectGetRule } from "./no-reflect-get.ts";
import { noRuntimeTypeofRule } from "./no-runtime-typeof.ts";
import { noUnknownParametersRule } from "./no-unknown-parameters.ts";
import { noUnknownReturnsRule } from "./no-unknown-returns.ts";
import { noUnknownTypeAliasesRule } from "./no-unknown-type-aliases.ts";
import { noUnsafeDictionaryTypeRule } from "./no-unsafe-dictionary-type.ts";

export default eslintCompatPlugin({
  meta: { name: "anti-slop" },
  rules: {
    "no-array-filter-map": noArrayFilterMapRule,
    "no-conditional-empty-object-spread": noConditionalEmptyObjectSpreadRule,
    "no-known-value-widening": noKnownValueWideningRule,
    "no-module-mocking": noModuleMockingRule,
    "no-object-parameters": noObjectParametersRule,
    "no-reduce-accumulator-copy": noReduceAccumulatorCopyRule,
    "no-reflect-apply": noReflectApplyRule,
    "no-reflect-get": noReflectGetRule,
    "no-runtime-typeof": noRuntimeTypeofRule,
    "no-unknown-parameters": noUnknownParametersRule,
    "no-unknown-returns": noUnknownReturnsRule,
    "no-unknown-type-aliases": noUnknownTypeAliasesRule,
    "no-unsafe-dictionary-type": noUnsafeDictionaryTypeRule
  }
});
