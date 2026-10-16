import { parseHTML } from "linkedom";
import { expect, it } from "vite-plus/test";

import { get, text } from "./server.ts";

async function byteSize(path: string): Promise<number> {
  const response = await get(path);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.arrayBuffer()).byteLength;
}

it("loads at most 13.4 KB of JavaScript by URL with the home page: its script[src] and modulepreload files, not inline scripts or lazily loaded islands", async () => {
  const { document } = parseHTML(await text("/"));
  const urls = ({ selector, attribute }: { selector: string; attribute: string }) =>
    [...document.querySelectorAll(selector)].map(el => {
      const value = el.getAttribute(attribute);
      if (value === null) throw new Error(`${selector} matched an element without ${attribute}`);
      return value;
    });
  const scripts = [
    ...urls({ selector: "script[src]", attribute: "src" }),
    ...urls({ selector: 'link[rel="modulepreload"][href]', attribute: "href" })
  ];
  const sizes = await Promise.all(scripts.map(byteSize));
  expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThanOrEqual(13_445);
});
