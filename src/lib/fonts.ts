// Fira Code variable font, latin subset only (weights 300-700). Declared here
// instead of @fontsource's CSS, which declares seven subsets the page never
// uses. Layouts inline FIRA_CODE_FACE and preload FIRA_CODE_URL.
// Ligatures (`calt`) turn "->" into arrows; layouts disable them for body text.
import firaCodeUrl from "@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2?url";

export const FIRA_CODE_URL: string = firaCodeUrl;

export const FIRA_CODE_FACE = `@font-face{font-family:"Fira Code";font-style:normal;font-weight:300 700;font-display:swap;src:url(${firaCodeUrl}) format("woff2-variations")}`;
