import { afterEach, assert, beforeAll, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";

import {
  initClickTracking,
  redactBlogFilters,
  reportError,
  scheduleSdkLoad,
  tag,
  track
} from "./analytics";
import { onFirstInteraction } from "./first-interaction";

const fakeSdk = () => {
  const sdk = {
    capture: vi.fn(),
    register: vi.fn(),
    captureException: vi.fn(),
    init: vi.fn(),
    startSessionRecording: vi.fn()
  };
  return { sdk, ...sdk };
};

const withPostHog = () => {
  const fake = fakeSdk();
  (globalThis as { posthog?: unknown }).posthog = fake.sdk;
  return fake;
};

afterEach(() => {
  delete (globalThis as { posthog?: unknown }).posthog;
});

// The module keeps state (booted SDK, buffer), so SDK tests need a fresh copy.
const fresh = async () => {
  vi.resetModules();
  return await import("./analytics");
};

const doc = (html: string) => parseHTML(html).document as unknown as Document;

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

describe("track", () => {
  it("captures the event with its properties", () => {
    const { capture } = withPostHog();
    track("social_click", { social: "github" });
    expect(capture.mock.calls).toEqual([["social_click", { social: "github" }]]);
  });

  it("drops properties with a blank value", () => {
    const { capture } = withPostHog();
    track("blog_card_click", { post: "", tag: "  " });
    expect(capture.mock.calls).toEqual([["blog_card_click", undefined]]);
  });

  it("does nothing when the snippet was never loaded", () => {
    expect(() => track("resume_download")).not.toThrow();
  });

  it("swallows failures from inside posthog", () => {
    (globalThis as { posthog?: unknown }).posthog = {
      capture: () => {
        throw new Error("blocked");
      },
      register: () => {}
    };
    expect(() => track("resume_download")).not.toThrow();
  });
});

describe("reportError", () => {
  it("reports the error with its non-blank properties", () => {
    const { captureException } = withPostHog();
    const err = new Error("boom");
    reportError(err, { surface: "chat", tag: " " });
    expect(captureException.mock.calls).toEqual([[err, { surface: "chat" }]]);
  });
});

describe("tag", () => {
  it("registers a super property", () => {
    const { register, capture } = withPostHog();
    tag("theme", "dark");
    expect(register.mock.calls).toEqual([[{ theme: "dark" }]]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("ignores a blank value", () => {
    const { register } = withPostHog();
    tag("theme", "");
    expect(register).not.toHaveBeenCalled();
  });
});

describe("initClickTracking", () => {
  const click = (d: Document, id: string) => {
    const Ctor = (d.defaultView as unknown as { Event: typeof Event }).Event;
    const target = d.getElementById(id);
    assert(target, `no #${id} in the fixture`);
    target.dispatchEvent(new Ctor("click", { bubbles: true }));
  };

  it("captures the nearest annotated ancestor of the click target", () => {
    const { capture } = withPostHog();
    const d = doc(
      `<a data-ph-event="social_click" data-ph-prop="social" data-ph-value="github"><svg id="glyph"></svg></a>`
    );
    initClickTracking(d);
    click(d, "glyph");
    expect(capture.mock.calls).toEqual([["social_click", { social: "github" }]]);
  });

  it("ignores clicks with no annotated ancestor", () => {
    const { capture } = withPostHog();
    const d = doc(`<a id="plain" href="/">Home</a>`);
    initClickTracking(d);
    click(d, "plain");
    expect(capture).not.toHaveBeenCalled();
  });

  it("attaches one listener however many times it is called", () => {
    const { capture } = withPostHog();
    const d = doc(`<a id="cv" data-ph-event="resume_download"></a>`);
    initClickTracking(d);
    initClickTracking(d);
    click(d, "cv");
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("redactBlogFilters", () => {
  it("strips the blog's filter params and keeps the rest", () => {
    expect(
      redactBlogFilters(
        "https://murugappan.dev/blog/?q=closures&tag=javascript&tag=fundamentals&utm_source=x"
      )
    ).toBe("https://murugappan.dev/blog/?utm_source=x");
  });

  it.each([
    "https://www.google.com/search?q=secret",
    "https://murugappan.dev/blog/",
    "https://murugappan.dev/resume/?q=x",
    "not a url?q=x"
  ])("leaves %s alone", url => {
    expect(redactBlogFilters(url)).toBe(url);
  });
});

describe("initAnalytics", () => {
  describe("SDK config", () => {
    let init: ReturnType<typeof vi.fn>;
    let config: {
      api_host: string;
      session_recording: { maskAllInputs: boolean; maskTextSelector: string };
      sanitize_properties: (properties: Record<string, unknown>) => Record<string, unknown>;
    };

    beforeAll(async () => {
      const fake = fakeSdk();
      const ph = await fresh();
      await ph.initAnalytics("phc_test", "https://e.example.dev", async () => fake.sdk);
      init = fake.init;
      config = init.mock.calls[0][1];
    });

    it("initialises the SDK once with the token and the proxy host", () => {
      expect(init).toHaveBeenCalledTimes(1);
      expect(init.mock.calls[0][0]).toBe("phc_test");
      expect(config.api_host).toBe("https://e.example.dev");
    });

    it("masks the chat transcript in recordings, not just inputs", () => {
      expect(config.session_recording.maskAllInputs).toBe(true);
      expect(config.session_recording.maskTextSelector).toBe("[data-ph-mask]");
    });

    it("scrubs blog filter params from captured URLs", () => {
      const properties = config.sanitize_properties({
        $current_url: "https://murugappan.dev/blog/?q=socket&tag=backend",
        $referrer: "https://murugappan.dev/blog/?q=oauth",
        distinct_id: "abc"
      });
      expect(properties).toEqual({
        $current_url: "https://murugappan.dev/blog/",
        $referrer: "https://murugappan.dev/blog/",
        distinct_id: "abc"
      });
    });
  });

  it("starts session replay on the first interaction, not at boot", async () => {
    const { sdk, init, startSessionRecording } = fakeSdk();
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    try {
      const ph = await fresh();
      await ph.initAnalytics("phc_test", "https://e.example.dev", async () => sdk);
      expect(init.mock.calls[0][1].disable_session_recording).toBe(true);
      expect(startSessionRecording).not.toHaveBeenCalled();
      win.dispatchEvent(new Event("pointermove"));
      expect(startSessionRecording).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("replays events captured before the SDK finished loading", async () => {
    const { sdk, capture, register } = fakeSdk();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const ph = await fresh();
    const booting = ph.initAnalytics("phc_test", "https://e.example.dev", async () => {
      await gate;
      return sdk;
    });
    ph.track("resume_download");
    ph.tag("theme", "dark");
    expect(capture).not.toHaveBeenCalled();
    release();
    await booting;
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
    expect(register.mock.calls).toEqual([[{ theme: "dark" }]]);
  });

  it("does nothing without a token or host", async () => {
    const { sdk, init } = fakeSdk();
    const ph = await fresh();
    await ph.initAnalytics("", "https://e.example.dev", async () => sdk);
    await ph.initAnalytics("phc_test", "", async () => sdk);
    expect(init).not.toHaveBeenCalled();
  });

  it("survives the SDK failing to load", async () => {
    const ph = await fresh();
    await expect(
      ph.initAnalytics("phc_test", "https://e.example.dev", async () => {
        throw new Error("chunk load failed");
      })
    ).resolves.toBeUndefined();
  });
});

describe("bootAnalytics", () => {
  const metas = `<meta name="ph-token" content="phc_test"><meta name="ph-host" content="https://e.example.dev">`;
  const page = (head: string) => doc(`<html><head>${head}</head><body></body></html>`);

  it("reads the token and host from the page's meta tags", async () => {
    const { sdk, init } = fakeSdk();
    const ph = await fresh();
    await ph.bootAnalytics(page(metas), async () => sdk);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toBe("phc_test");
    expect(init.mock.calls[0][1].api_host).toBe("https://e.example.dev");
  });

  it("no-ops when the meta tags are absent (local dev, CI)", async () => {
    const { sdk, init } = fakeSdk();
    const ph = await fresh();
    await ph.bootAnalytics(page(""), async () => sdk);
    expect(init).not.toHaveBeenCalled();
  });

  it("buffers errors and rejections thrown before the SDK boots and replays them", async () => {
    const { sdk, captureException } = fakeSdk();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const d = page(metas);
    assert(d.defaultView, "fixture page has no window");
    const win = d.defaultView as unknown as typeof globalThis;
    const ph = await fresh();
    const booting = ph.bootAnalytics(d, async () => {
      await gate;
      return sdk;
    });
    const err = new Error("hydration failed");
    const reason = new Error("fetch failed");
    win.dispatchEvent(Object.assign(new win.Event("error"), { error: err }));
    win.dispatchEvent(Object.assign(new win.Event("unhandledrejection"), { reason }));
    release();
    await booting;
    expect(captureException.mock.calls).toEqual([
      [err, undefined],
      [reason, undefined]
    ]);
    // detached once PostHog's autocapture takes over, so nothing doubles
    win.dispatchEvent(new win.Event("error"));
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});

describe("scheduleSdkLoad", () => {
  afterEach(() => vi.useRealTimers());

  it("loads on the first interaction and cancels the fallback timer", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const load = vi.fn();
    scheduleSdkLoad(load, target, 10_000);
    expect(load).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("pointermove"));
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to the timer for a visitor who never interacts", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const load = vi.fn();
    scheduleSdkLoad(load, target, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(load).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event("keydown"));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
