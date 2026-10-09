import { RuleConfigSeverity, type UserConfig } from "@commitlint/types";

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-case": [RuleConfigSeverity.Error, "always", "lower-case"],
    // Subjects often start with proper nouns (Jarvis, DeepSeek, WebMCP).
    "subject-case": [RuleConfigSeverity.Disabled],
    "type-enum": [
      RuleConfigSeverity.Error,
      "always",
      [
        "build",
        "chore",
        "ci",
        // Site copy: bio, experience entries, blog posts.
        "content",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test"
      ]
    ]
  }
} satisfies UserConfig;
