import { eslintCompatPlugin } from "vite-plus/lint/plugins";

import { noManualTagComparisonRule } from "./no-manual-tag-comparison.ts";
import { preferEffectMatchRule } from "./prefer-effect-match.ts";

export default eslintCompatPlugin({
  meta: { name: "anti-slop-effect" },
  rules: {
    "no-manual-tag-comparison": noManualTagComparisonRule,
    "prefer-effect-match": preferEffectMatchRule
  }
});
