import { afterEach, expect, it, vi } from "vite-plus/test";

import { turnstileChallenge } from "./turnstile.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ignore = () => {};

const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

function challenge() {
  const renders: HTMLElement[] = [];
  vi.stubGlobal("turnstile", {
    render: (container: HTMLElement) => {
      renders.push(container);
      return "widget";
    },
    remove: ignore
  });
  const check = turnstileChallenge({
    siteKey: "site-key",
    onInteractiveChange: ignore,
    onFocusLost: ignore
  });
  if (!check) throw new Error("a site key makes a challenge");
  return { ...check, renders };
}

it("gives up a token request waiting for a panel when the session closes", async () => {
  const check = challenge();
  const token = check.token();
  await nextTask();

  check.close();

  await expect(token).rejects.toThrow("The chat session closed");
});

it("gives up a token request when the session closes before its panel does", async () => {
  const check = challenge();
  const container = document.createElement("div");
  const detach = check.ref(container);
  const token = check.token();
  await expect.poll(() => check.renders).toEqual([container]);

  check.close();
  detach?.();

  await expect(token).rejects.toThrow("The chat session closed");
});
