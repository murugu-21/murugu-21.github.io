import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";
import { ROOT } from "./site-dir.ts";

// The author's release ships only full fonts (113 KB). Google's latin subset
// (fontsource) is 5.002 rescaled to 2000 UPM and drops ←↑→↓.
export const FIRA_CODE_VF = fileURLToPath(
  import.meta.resolve("firacode/distr/woff2/FiraCode-VF.woff2")
);

// fontsource's latin range plus U+2190-2193.
const UNICODE_RANGE =
  "U+0020-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329," +
  "U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD";

// The site only toggles calt (code ligatures); the rest keep marks and
// fractions shaping. Dropping the cv/ss variants saves about 10 KB.
export const FIRA_CODE_FEATURES = ["calt", "ccmp", "dnom", "frac", "numr", "mark", "mkmk"];

// Generated at config setup rather than committed, so every dev, build or
// check run rewrites it (about 260 ms).
export const FIRA_CODE_SUBSET = join(ROOT, "node_modules/.cache/fira-code/fira-code.woff2");

// Every character a CSS unicode-range list ("U+0020-007E,U+00A9") covers.
export const unicodeRangeText = (ranges: string) =>
  ranges
    .split(",")
    .flatMap(range => {
      const [from, to = from] = range
        .slice(2)
        .split("-")
        .map(hex => Number.parseInt(hex, 16));
      return Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i));
    })
    .join("");

export async function writeFiraCodeSubset(): Promise<void> {
  const text = unicodeRangeText(UNICODE_RANGE);
  const woff2 = await subsetFont(readFileSync(FIRA_CODE_VF), text, {
    targetFormat: "woff2",
    keepFeatures: FIRA_CODE_FEATURES
  });
  mkdirSync(dirname(FIRA_CODE_SUBSET), { recursive: true });
  writeFileSync(FIRA_CODE_SUBSET, woff2);
}
