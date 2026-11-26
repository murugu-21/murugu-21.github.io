import { expect, it } from "vite-plus/test";

import { findSelfLinkedImages } from "./self-linked-images";

it("finds a local image wrapped in a link to its own file, and no other linked image", () => {
  const markdown = [
    "[![React logo](react.jpg)](./react.jpg)",
    "[**![Hook flow](hooks/flow.png)**](hooks/flow.png)",
    "[![Thumbnail](thumb.png)](full.png)",
    "[![Remote](https://cdn.example.com/x.png)](https://cdn.example.com/x.png)",
    "![Plain](plain.png)",
    "`[![alt](code.jpg)](code.jpg)`"
  ].join("\n\n");

  expect(findSelfLinkedImages(markdown)).toEqual(["react.jpg", "hooks/flow.png"]);
});
