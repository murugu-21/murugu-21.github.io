import { afterEach, assert, beforeAll, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { z } from "zod";

import {
  initClickTracking,
  maskReferrers,
  reportError,
  scheduleSdkLoad,
  tag,
  track
} from "./analytics";
import { onFirstInteraction } from "./first-interaction";

const fakeSdk = () => {
  const sdk = {
    capture: vi.fn<(event: string, properties?: Record<string, string>) => void>(),
    register: vi.fn<(properties: Record<string, string>) => void>(),
    captureException: vi.fn<(error: unknown, properties?: Record<string, string>) => void>(),
    init: vi.fn<(token: string, config: Record<string, unknown>) => void>(),
    startSessionRecording: vi.fn<() => void>()
  };
  return { sdk, ...sdk };
};

const withPostHog = () => {
  const fake = fakeSdk();
  globalThis.posthog = fake.sdk;
  return fake;
};

afterEach(() => {
  delete globalThis.posthog;
});

// The module keeps state (booted SDK, buffer), so SDK tests need a fresh copy.
const fresh = async () => {
  vi.resetModules();
  return import("./analytics");
};

const doc = (html: string) => parseHTML(html).document;

describe("onFirstInteraction", () => {
  it("fires once, on the first input, then stops listening", () => {
    const target = new EventTarget();
    let fired = 0;
    onFirstInteraction(() => fired++, target);
    expect(fired).toBe(0);
    target.dispatchEvent(new Event("pointermove"));
    target.dispatchEvent(new Event("wheel"));
    target.dispatchEvent(new Event("keydown"));
    expect(fired).toBe(1);
  });

  it("waits through a page that is only loaded (a Lighthouse run) for real input", () => {
    const target = new EventTarget();
    let fired = 0;
    onFirstInteraction(() => fired++, target);
    target.dispatchEvent(new Event("load"));
    target.dispatchEvent(new Event("DOMContentLoaded"));
    // Chrome fires a trusted scroll during load with no user input.
    target.dispatchEvent(new Event("scroll"));
    expect(fired).toBe(0);
    target.dispatchEvent(new Event("pointerdown"));
    expect(fired).toBe(1);
  });

  it("never fires after being cancelled", () => {
    const target = new EventTarget();
    let cancelled = 0;
    let kept = 0;
    onFirstInteraction(() => cancelled++, target)();
    onFirstInteraction(() => kept++, target);
    target.dispatchEvent(new Event("pointerdown"));
    expect({ cancelled, kept }).toEqual({ cancelled: 0, kept: 1 });
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

  it("drops events while no SDK is loaded instead of queueing them", () => {
    track("resume_download");
    const { capture } = withPostHog();
    track("social_click");
    expect(capture.mock.calls).toEqual([["social_click", undefined]]);
  });

  it("swallows a failure inside posthog and keeps sending later events", () => {
    const sent: string[] = [];
    globalThis.posthog = {
      capture: (event: string) => {
        sent.push(event);
        if (event === "resume_download") throw new Error("blocked");
      },
      register: () => {}
    };
    track("resume_download");
    track("social_click");
    expect(sent).toEqual(["resume_download", "social_click"]);
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
  it("registers a super property, ignoring a blank value", () => {
    const { register } = withPostHog();
    tag("theme", "");
    tag("theme", "dark");
    expect(register.mock.calls).toEqual([[{ theme: "dark" }]]);
  });
});

describe("initClickTracking", () => {
  const click = (d: Document, id: string) => {
    const win = d.defaultView;
    const target = d.getElementById(id);
    assert(win && target, `no window or #${id} in the fixture`);
    target.dispatchEvent(new win.Event("click", { bubbles: true }));
  };

  it("captures the nearest annotated ancestor of the click target, and nothing else", () => {
    const { capture } = withPostHog();
    const d = doc(
      `<a id="plain" href="/">Home</a><a data-ph-event="social_click" data-ph-prop="social" data-ph-value="github"><svg id="glyph"></svg></a>`
    );
    initClickTracking(d);
    click(d, "plain");
    click(d, "glyph");
    expect(capture.mock.calls).toEqual([["social_click", { social: "github" }]]);
  });

  it("attaches one listener however many times it is called", () => {
    const { capture } = withPostHog();
    const d = doc(`<a id="cv" data-ph-event="resume_download"></a>`);
    initClickTracking(d);
    initClickTracking(d);
    click(d, "cv");
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
  });
});

describe("maskReferrers", () => {
  it("masks the blog's search text and tag in every referrer PostHog leaves alone", () => {
    const event = {
      uuid: "u",
      event: "$pageview",
      properties: {
        $current_url: "https://murugappan.dev/blog/coin-change-problem/",
        $referrer: "https://murugappan.dev/blog/?q=coin&tag=algorithms&utm_source=x",
        $session_entry_referrer: "https://murugappan.dev/blog/?tag=react#top",
        distinct_id: "abc"
      },
      $set_once: { $initial_referrer: "https://murugappan.dev/blog/?q=oauth" }
    };
    expect(maskReferrers(event)).toEqual({
      ...event,
      properties: {
        $current_url: "https://murugappan.dev/blog/coin-change-problem/",
        $referrer: "https://murugappan.dev/blog/?q=<masked>&tag=<masked>&utm_source=x",
        $session_entry_referrer: "https://murugappan.dev/blog/?tag=<masked>#top",
        distinct_id: "abc"
      },
      $set_once: { $initial_referrer: "https://murugappan.dev/blog/?q=<masked>" }
    });
    expect(maskReferrers(null)).toBeNull();
  });
});

describe("initAnalytics", () => {
  describe("SDK config", () => {
    const InitConfig = z.object({
      api_host: z.string(),
      session_recording: z.object({ maskAllInputs: z.boolean(), maskTextSelector: z.string() })
    });
    let init: ReturnType<typeof fakeSdk>["init"];
    let config: z.infer<typeof InitConfig>;

    beforeAll(async () => {
      const fake = fakeSdk();
      const ph = await fresh();
      await ph.initAnalytics("phc_test", "https://e.example.dev", async () => fake.sdk);
      init = fake.init;
      config = InitConfig.parse(init.mock.calls[0][1]);
    });

    it("initialises the SDK once with the token and the proxy host", () => {
      expect(init.mock.calls.map(([token]) => token)).toEqual(["phc_test"]);
      expect(config.api_host).toBe("https://e.example.dev");
    });

    it("masks the chat transcript in recordings, not just inputs", () => {
      expect(config.session_recording.maskAllInputs).toBe(true);
      expect(config.session_recording.maskTextSelector).toBe("[data-ph-mask]");
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
      expect(startSessionRecording.mock.calls).toEqual([]);
      win.dispatchEvent(new Event("pointermove"));
      expect(startSessionRecording.mock.calls).toEqual([[]]);
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

  it("does nothing until it has both a token and a host", async () => {
    const { sdk, init } = fakeSdk();
    const ph = await fresh();
    await ph.initAnalytics("", "https://e.example.dev", async () => sdk);
    await ph.initAnalytics("phc_test", "", async () => sdk);
    await ph.initAnalytics("phc_test", "https://e.example.dev", async () => sdk);
    expect(init.mock.calls.map(([token]) => token)).toEqual(["phc_test"]);
  });

  it("drops what it buffered when the SDK fails to load, and can boot later", async () => {
    const { sdk, capture } = fakeSdk();
    const ph = await fresh();
    const failing = ph.initAnalytics("phc_test", "https://e.example.dev", async () => {
      throw new Error("chunk load failed");
    });
    ph.track("resume_download");
    await failing;
    await ph.initAnalytics("phc_test", "https://e.example.dev", async () => sdk);
    ph.track("social_click");
    expect(capture.mock.calls).toEqual([["social_click", undefined]]);
  });
});

describe("bootAnalytics", () => {
  const metas = `<meta name="ph-token" content="phc_test"><meta name="ph-host" content="https://e.example.dev">`;
  const page = (head: string) => doc(`<html><head>${head}</head><body></body></html>`);

  it("reads the token and host from the page's meta tags, and no-ops without them", async () => {
    const { sdk, init } = fakeSdk();
    const ph = await fresh();
    // local dev and CI pages carry no meta tags
    await ph.bootAnalytics(page(""), async () => sdk);
    await ph.bootAnalytics(page(metas), async () => sdk);
    expect(init.mock.calls.map(([token, config]) => [token, config.api_host])).toEqual([
      ["phc_test", "https://e.example.dev"]
    ]);
  });

  it("buffers errors and rejections thrown before the SDK boots and replays them", async () => {
    const { sdk, captureException } = fakeSdk();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const d = page(metas);
    const win = d.defaultView;
    assert(win, "fixture page has no window");
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
    expect(captureException.mock.calls).toHaveLength(2);
  });
});

describe("scheduleSdkLoad", () => {
  afterEach(() => vi.useRealTimers());

  it("loads on the first interaction and cancels the fallback timer", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    let loads = 0;
    scheduleSdkLoad(() => loads++, target, 10_000);
    expect(loads).toBe(0);
    target.dispatchEvent(new Event("pointermove"));
    vi.advanceTimersByTime(20_000);
    expect(loads).toBe(1);
  });

  it("falls back to the timer for a visitor who never interacts", () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    let loads = 0;
    scheduleSdkLoad(() => loads++, target, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(loads).toBe(0);
    vi.advanceTimersByTime(1);
    target.dispatchEvent(new Event("keydown"));
    expect(loads).toBe(1);
  });
});
