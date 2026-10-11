# React 19 islands

**Lint covers.** The rules of hooks (site only, since Effect's `Service.use` isn't a hook), exact effect dependencies (`react/exhaustive-deps` and the compiler-based `react/exhaustive-effect-dependencies`), the React Compiler's purity rules (`purity`, `refs`, `immutability`, `globals`, `set-state-in-render`, `set-state-in-effect`, `static-components`), derived state in effects, nested component definitions, index keys, and `jsx-a11y`. All of them fail the gate.

Rules lint can't check:

- **REACT-1.** An Effect only syncs with something outside React: the DOM, a socket, a timer, a browser API. Derive values during render, run event logic in the handler, reset state with `key`, and read external stores with `useSyncExternalStore`.
- **REACT-2.** Effect dependencies are stable. An array or object rebuilt on every render, such as the result of `toBubbles(messages)`, makes the effect run on every render even when lint is satisfied.
- **REACT-3.** Key lists by a stable id from the data. An index key is acceptable only for a list that never reorders, with a disable comment that says so.
- **REACT-4.** Don't add `useMemo`, `useCallback` or `memo` without a measured reason.
- **REACT-5.** Build controls from the vendored shadcn primitives in `apps/site/src/components/ui/` (Radix handles focus, keyboard and ARIA) before writing one by hand. Keep vendored files close to upstream and note any change in the file.
- **REACT-6.** Pass `ref` as a prop. No `forwardRef` in new code.
- **REACT-7.** Announce new dynamic content with `aria-live` at the right politeness: polite for streamed replies and status, assertive only for errors that block the visitor.
- **REACT-8.** An island stays small. It reads server data through props from its `.astro` parent, not by fetching what the build already has.
- **REACT-9.** Don't import a large library into an island for one function. The chat widget loads on the visitor's first input, so its bundle is the first-tap cost.

Sources: https://react.dev/reference/rules, https://react.dev/learn/you-might-not-need-an-effect, https://react.dev/reference/eslint-plugin-react-hooks, https://react.dev/learn/rendering-lists, https://react.dev/learn/react-compiler/introduction, https://ui.shadcn.com/docs/tailwind-v4.
