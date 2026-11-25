import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { showSaved } from "./consent-toast";

it("shows the saved message until its close button is pressed", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  showSaved(host, "Saved: analytics on, recordings off.");
  await expect.element(page.getByText("Saved: analytics on, recordings off.")).toBeVisible();
  expect(document.documentElement.hasAttribute("data-consent-saved")).toBe(true);

  await page.getByRole("button", { name: "Close toast" }).click();
  await expect
    .element(page.getByText("Saved: analytics on, recordings off."))
    .not.toBeInTheDocument();
  expect(document.documentElement.hasAttribute("data-consent-saved")).toBe(false);
});
