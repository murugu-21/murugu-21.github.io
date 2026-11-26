/// <reference types="vite-plus/test/browser-playwright" />
import { afterEach, expect, it } from "vite-plus/test";

import { sharedElementScript } from "./shared-elements";

afterEach(() => document.body.replaceChildren());

it("runs as the inlined script Layout.astro ships, with nothing from its module in scope", () => {
  const heading = document.createElement("h1");
  heading.toggleAttribute("data-shared", true);
  Object.assign(heading.style, { position: "fixed", top: "-500px" });
  const script = document.createElement("script");
  script.textContent = sharedElementScript.source;
  document.body.append(heading, script);

  const viewTransition = { finished: Promise.resolve() };
  dispatchEvent(Object.assign(new Event("pagereveal"), { viewTransition }));

  expect(heading.hasAttribute("data-offscreen")).toBe(true);
});
