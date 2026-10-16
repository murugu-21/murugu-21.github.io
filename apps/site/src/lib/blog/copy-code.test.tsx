import { afterEach, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { codeToHtml } from "shiki";

import { installCopyCode } from "./copy-code";
import { copyButton } from "./shiki-copy-button";

const renderPost = async (fences: string[]) => {
  const body = document.createElement("section");
  const blocks = await Promise.all(
    fences.map(code =>
      codeToHtml(code, { lang: "sh", theme: "night-owl", transformers: [copyButton] })
    )
  );
  body.innerHTML = blocks.join("");
  document.body.append(body);
  installCopyCode(body);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
};

const clipboardSettled = (write: { mock: { results: { value: unknown }[] } }) =>
  Promise.allSettled(write.mock.results.map(result => result.value));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});

it("copies the clicked fence's code, announces it, then resets after two seconds", async () => {
  await renderPost(["echo first", "bun install\nbun run test"]);

  await userEvent.click(page.getByRole("button", { name: "Copy code" }).nth(1));

  await expect.element(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect.element(page.getByRole("status")).toHaveTextContent("Copied");
  expect(await navigator.clipboard.readText()).toBe("bun install\nbun run test");

  vi.advanceTimersByTime(2000);
  await expect.element(page.getByRole("button", { name: "Copy code" }).nth(1)).toBeVisible();
  await expect.element(page.getByRole("status")).toHaveTextContent("");
});

it("restarts the two seconds on a second click", async () => {
  await renderPost(["echo hi"]);
  const write = vi.spyOn(navigator.clipboard, "writeText");
  const button = page.getByRole("button");

  await userEvent.click(button);
  await clipboardSettled(write);
  vi.advanceTimersByTime(1500);
  await userEvent.click(button);
  await clipboardSettled(write);
  vi.advanceTimersByTime(1000);

  await expect.element(button).toHaveAccessibleName("Copied");
});

it("leaves the button as it was when the clipboard refuses, and copies on the next click", async () => {
  await renderPost(["echo hi"]);
  const write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValueOnce(new Error("denied"));
  const button = page.getByRole("button");

  await userEvent.click(button);
  await clipboardSettled(write);
  // Checked once, not polled: polling advances the fake timers, which would run a reset.
  expect(button.element()).toHaveAccessibleName("Copy code");
  expect(page.getByRole("status").element()).toHaveTextContent("");

  await userEvent.click(button);
  await expect.element(button).toHaveAccessibleName("Copied");
});
