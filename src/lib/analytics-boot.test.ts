import { parseHTML } from "linkedom";
import { afterEach, assert, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  init: vi.fn<(token: string, config: Record<string, unknown>) => void>(),
  capture: vi.fn<(event: string, properties?: Record<string, string>) => void>(),
  register: vi.fn<(properties: Record<string, string>) => void>(),
  captureException: vi.fn<(error: unknown) => void>(),
  startSessionRecording: vi.fn<() => void>()
}));

vi.mock("posthog-js", () => ({ default: posthog }));

afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.posthog;
});

describe("analytics on a real page load", () => {
  it("keeps the SDK out of the page until the visitor's first input, then sends events", async () => {
    const { document } = parseHTML(
      `<html><head><meta name="ph-token" content="phc_test"><meta name="ph-host" content="https://e.example.dev/"></head><body></body></html>`
    );
    const win = document.defaultView;
    assert(win, "fixture page has no window");
    vi.stubGlobal("document", document);
    vi.resetModules();
    const analytics = await import("./analytics");

    await analytics.bootAnalytics();
    expect(posthog.init.mock.calls).toEqual([]);

    win.dispatchEvent(new win.Event("pointerdown"));
    await vi.waitFor(() => expect(posthog.init.mock.calls).toHaveLength(1));
    expect(posthog.init.mock.calls[0]?.[0]).toBe("phc_test");
    expect(posthog.init.mock.calls[0]?.[1].api_host).toBe("https://e.example.dev");

    analytics.track("cta_click", { where: "hero" });
    expect(posthog.capture.mock.calls).toEqual([["cta_click", { where: "hero" }]]);
  });
});
