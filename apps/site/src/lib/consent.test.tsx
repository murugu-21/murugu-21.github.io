import { expect, it } from "vite-plus/test";

import { linkReplayToCounts } from "./consent";

it("turns visit counts on with replay, and replay off with visit counts", () => {
  const modal = document.createElement("div");
  modal.innerHTML = `<input type="checkbox" value="statistics"><input type="checkbox" value="replay">`;
  linkReplayToCounts(modal);
  const input = (value: string) => {
    const el = modal.querySelector<HTMLInputElement>(`input[value="${value}"]`);
    if (!el) throw new Error(`no ${value} toggle`);
    return el;
  };
  const flip = (value: string, checked: boolean) => {
    input(value).checked = checked;
    input(value).dispatchEvent(new Event("change", { bubbles: true }));
    return [input("statistics").checked, input("replay").checked];
  };
  expect(flip("replay", true)).toEqual([true, true]);
  expect(flip("statistics", false)).toEqual([false, false]);
  expect(flip("statistics", true)).toEqual([true, false]);
});
