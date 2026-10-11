import type { RuleTester } from "vite-plus/lint/plugins-dev";

// oxlint doesn't export its plugin or AST types; derive them from RuleTester.
export type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
export type NodeOf<K extends keyof Visitor> = Parameters<NonNullable<Visitor[K]>>[0];
export type Plugin = { meta: { name: string }; rules: Record<string, Rule> };
