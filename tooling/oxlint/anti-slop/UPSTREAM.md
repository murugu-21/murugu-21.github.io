# Upstream

Vendored from [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop) at
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (2026-09-10), MIT (`LICENSE`). Only the rules
`tooling/lint.config.ts` enables are copied. The files are formatted and linted as repo code.

## Copying a rule

- **Layout.** One flat folder, so nothing imports a parent. Upstream's `src/rules/`,
  `src/shared/`, `src/effect/rules/` and `src/effect/shared/` all land here. `src/index.ts` is
  `index.ts` (plugin `anti-slop`) and `src/effect/index.ts` is `effect.ts` (plugin
  `anti-slop-effect`).
- **Imports.** `@oxlint/plugins` becomes `vite-plus/lint/plugins`, which re-exports it.
  `../shared/x.ts` becomes `./x.ts`.
- **Tests.** Copy the rule's test unchanged except for its tester: import `tester` from
  `@murugappan/tooling/oxlint/rule-tester.ts` instead of building a `RuleTester`.
- **House rules.** A helper over three parameters becomes a closure or takes an options
  object. An `as` cast becomes a type guard. A `typeof` check moves into a type guard. Reuse
  `ast.ts`, `scope.ts` and the other helpers here rather than copying upstream's versions.
- Register the rule in `index.ts` or `effect.ts` and enable it in `tooling/lint.config.ts`.

## Local changes

- `ast.ts` is ours. It holds `isStringLiteral`, `staticPropertyName`, `typeReferenceName`,
  `unwrapExpression`, `equalityOperators`, `childNodes` and `VisitorKeys`, which upstream
  repeats across files. `unwrapExpression` is upstream's `unwrapArrayExpression` from
  `array-method.ts`, and also replaces the unwrap loops in `dictionary-types.ts` and
  `no-known-value-widening.ts`. `childNodes` reads fields through a `Map` instead of a
  `Record<string, unknown>` guard.
- `type-alias-resolution.ts`: `collectTypeBindings` is a closure inside
  `createTypeAliasEnvironment` (max-params).
- `no-reduce-accumulator-copy.ts`: `referencesAccumulator` keeps `visited` in a closure
  (max-params).
- `lexical-type-parameters.ts` and `type-alias-resolution.ts`: the `as unknown as Record` casts
  that walked child nodes are replaced by `childNodes`.
- `no-runtime-typeof.ts`: the inline option check is the `allowsTypeGuards` type guard.
- `array-method.ts`: `resolveArrayBinding` calls `scope.ts`'s `resolveVariable`.
- `scope.ts`: `constInitializer` replaces the const-initializer loop repeated in
  `array-method.ts` and `no-reduce-accumulator-copy.ts`. `resolveVariable` takes any
  identifier node.
- `function-parameters.ts`: `FunctionSignature` and `signatureVisitors` replace the copies in
  `no-object-parameters.ts`, `no-unknown-parameters.ts` and `no-unknown-returns.ts`.
- `dictionary-types.ts`: the substitutions and the aliases being expanded travel together as a
  `Resolution` (max-params), and `expandAlias` replaces the alias-expansion block upstream
  repeats in four functions. `WideningTargetKind` is not exported, since nothing imports it.
- `no-known-value-widening.ts`: `hasKnownCallArgumentEvidence` keeps `visitedVariables` in a
  closure (max-params).
- `type-alias-resolution.ts` exports `visibleTypeAlias` and `hasVisibleTypeBinding`, which
  `dictionary-types.ts` needs.
- `no-module-mocking.ts` and `reflect-method.ts` read the member name with
  `staticPropertyName`, so the mock method names live only in `moduleMockMethods`.
- Deleted as unused here: `isReasonTagMember`, `propertyName`, `isMatchPatternObject` and
  `isPopulatedObjectExpression`.
- Dropped rule: `anti-slop-effect/no-service-constructor-imports`. It matches only `./` and
  `../` imports of `make*` constructors, and this repo imports through `#src/` and has none.
- JSDoc that restated a function's name or its rule's description is removed.
