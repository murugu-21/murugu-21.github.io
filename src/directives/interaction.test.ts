import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";

import interaction from "./interaction";

afterEach(() => vi.unstubAllGlobals());

describe("client:interaction", () => {
  it("hydrates the island on the first input anywhere, remembering a launcher tap meanwhile", async () => {
    const page = new EventTarget();
    vi.stubGlobal("window", page);
    const { document, Event: DomEvent } = parseHTML("<div></div>");
    const el = document.createElement("div");
    const hydrated: string[] = [];

    interaction(
      async () => async () => {
        hydrated.push("hydrated");
      },
      { name: "interaction", value: "" },
      el
    );
    el.dispatchEvent(new DomEvent("click"));
    expect(el.dataset.openOnHydrate).toBe("true");
    expect(hydrated).toEqual([]);

    page.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => expect(hydrated).toEqual(["hydrated"]));

    delete el.dataset.openOnHydrate;
    el.dispatchEvent(new DomEvent("click"));
    expect(el.dataset.openOnHydrate).toBeUndefined();
  });
});
