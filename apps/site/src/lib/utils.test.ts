import { expect, it } from "vite-plus/test";

import { formatRepoSize } from "./utils";

it.each([
  [512, "512 KB"],
  [1024, "1 MB"],
  [2560, "2.5 MB"]
])("formats a repository size of %i KB as %s", (kb, expected) => {
  expect(formatRepoSize(kb)).toBe(expected);
});
