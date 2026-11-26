import { expect, it } from "vite-plus/test";

import { nonEmpty } from "@murugappan/utils/text.ts";

it("turns an empty or null string into undefined and keeps any other string as is", () => {
  expect(["Ada", " ", "", null, undefined].map(nonEmpty)).toEqual([
    "Ada",
    " ",
    undefined,
    undefined,
    undefined
  ]);
});
