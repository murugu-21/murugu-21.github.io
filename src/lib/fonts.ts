// The site's one text face, Fira Code, as a variable font: a single latin
// file covers weights 300–700 for both apps. Declared here rather than via
// @fontsource's CSS so only that file is referenced — the package's
// index.css declares seven language subsets, each of which used to be
// multiplied by fontaine's generated fallback faces into tens of @font-face
// rules the page never used. The layouts inline FIRA_CODE_FACE in <head> and
// preload FIRA_CODE_URL so the face is usually ready by first paint.
//
// `calt` (contextual alternates) is Fira Code's programming-ligature feature:
// left on, "->" and "=>" in prose render as arrows. The layouts' body rules
// turn it off; code blocks may turn it back on.
import firaCodeUrl from "@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2?url";

export const FIRA_CODE_URL: string = firaCodeUrl;

export const FIRA_CODE_FACE = `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;font-display:swap;src:url(${firaCodeUrl}) format("woff2-variations")}`;
