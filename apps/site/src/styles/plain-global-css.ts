import css from "./global.css?raw";

// Unprocessed Tailwind at-rules (@import, @theme, @utility) are ignored by the
// browser, which leaves the plain rules browser tests mount. The imports are cut
// so the browser doesn't try to fetch them.
export const plainGlobalCss = css.replaceAll(/@import [^;]+;/g, "");
