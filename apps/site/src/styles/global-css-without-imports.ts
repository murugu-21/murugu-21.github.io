import css from "./global.css?raw";

export const globalCssWithoutImports = css.replaceAll(/@import [^;]+;/g, "");
