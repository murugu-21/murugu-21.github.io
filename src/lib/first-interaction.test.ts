import { describe, expect, it, vi } from "vitest";

import { onFirstInteraction } from "./first-interaction";

describe("onFirstInteraction", () => {
  it("fires once, on the first input, then stops listening", () => {
    const target = new EventTarget();
    const cb = vi.fn();
    onFirstInteraction(cb, target);
    expect(cb).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("wheel"));
    target.dispatchEvent(new Event("keydown"));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not fire for a page that is only loaded (a Lighthouse run)", () => {
    const target = new EventTarget();
    const cb = vi.fn();
    onFirstInteraction(cb, target);
    target.dispatchEvent(new Event("load"));
    target.dispatchEvent(new Event("DOMContentLoaded"));
    // Chrome fires a trusted scroll during load with no user input.
    target.dispatchEvent(new Event("scroll"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("never fires after being cancelled", () => {
    const target = new EventTarget();
    const cb = vi.fn();
    const cancel = onFirstInteraction(cb, target);
    cancel();
    target.dispatchEvent(new Event("pointerdown"));
    expect(cb).not.toHaveBeenCalled();
  });
});
