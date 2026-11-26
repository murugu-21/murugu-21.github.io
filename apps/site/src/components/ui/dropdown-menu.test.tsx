import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "vitest-browser-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./dropdown-menu.tsx";
import { PORTAL_HOST_ID } from "./portal-host.ts";

it("opens the menu inside the page's portal host, where the ui-island tokens apply", async () => {
  const host = document.createElement("div");
  host.id = PORTAL_HOST_ID;
  document.body.append(host);

  await render(
    <DropdownMenu>
      <DropdownMenuTrigger>Options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Start over</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  await page.getByRole("button", { name: "Options" }).click();

  await expect.element(page.getByRole("menuitem", { name: "Start over" })).toBeVisible();
  expect(host.contains(page.getByRole("menu").element())).toBe(true);
});
