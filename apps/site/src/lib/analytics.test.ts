import fc from "fast-check";
import { afterEach, assert, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { parseHTML } from "linkedom";
import type { PostHogConfig } from "posthog-js/dist/module.slim";
import { z } from "zod";

import {
  type ConsentChoice,
  initClickTracking,
  reportError,
  scheduleSdkLoad,
  tag,
  track
} from "./analytics";
import { onFirstInteraction } from "./first-interaction";
import { applyConsent, maskReferrers, postHogConfig } from "./posthog-sdk";

const fakeSdk = () => {
  const sdk = {
    capture: vi.fn<(event: string, properties?: Record<string, string>) => void>(),
    register: vi.fn<(properties: Record<string, string>) => void>(),
    captureException: vi.fn<(cause: unknown, properties?: Record<string, string>) => void>(),
    init: vi.fn<(token: string, config: Partial<PostHogConfig>) => void>(),
    startSessionRecording: vi.fn<() => void>(),
    stopSessionRecording: vi.fn<() => void>(),
    opt_in_capturing: vi.fn<(options: { captureProperties: Record<string, string> }) => void>(),
    opt_out_capturing: vi.fn<() => void>(),
    get_explicit_consent_status: vi.fn<() => "granted" | "denied" | "pending">(() => "pending")
  };
  const load = async () => ({ posthog: sdk, postHogConfig, applyConsent });
  return { sdk, load, ...sdk };
};

const chosen = (choice: Partial<ConsentChoice> = {}): ConsentChoice => ({
  analytics: true,
  replay: true,
  consentId: "consent-1",
  revision: 20261125,
  justChosen: false,
  ...choice
});

type Analytics = typeof import("./analytics");

const boot = (
  analytics: Analytics,
  {
    choice = chosen(),
    load
  }: { choice?: ConsentChoice; load: Parameters<Analytics["initAnalytics"]>[0]["load"] }
) => analytics.initAnalytics({ token: "phc_test", host: "https://e.example.dev", choice, load });

const withPostHog = () => {
  const fake = fakeSdk();
  globalThis.posthog = fake.sdk;
  return fake;
};

afterEach(() => {
  delete globalThis.posthog;
});

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
      cookieless_mode: z.string(),
      session_recording: z.object({ maskAllInputs: z.boolean(), maskTextSelector: z.string() })
    });
    let tokens: string[];
    let config: z.infer<typeof InitConfig>;

    // Vitest clears mock calls before each test, so read them here.
    beforeAll(async () => {
      const { init, load } = fakeSdk();
      const ph = await fresh();
      await boot(ph, { load });
      tokens = init.mock.calls.map(([token]) => token);
      config = InitConfig.parse(init.mock.calls[0][1]);
    });

    it("initialises the SDK once with the token and the proxy host", () => {
      expect(tokens).toEqual(["phc_test"]);
      expect(config.api_host).toBe("https://e.example.dev");
    });

    it("falls back to cookieless counting for a visitor who rejects", () => {
      expect(config.cookieless_mode).toBe("on_reject");
    });

    it("masks the chat transcript in recordings, not just inputs", () => {
      expect(config.session_recording.maskAllInputs).toBe(true);
      expect(config.session_recording.maskTextSelector).toBe("[data-ph-mask]");
    });
  });

  it("starts an allowed replay on the next interaction, or at once when the visitor just allowed it", async () => {
    const restored = fakeSdk();
    const justAllowed = fakeSdk();
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    try {
      await (
        await fresh()
      ).initAnalytics({
        token: "phc_test",
        host: "https://e.example.dev",
        choice: chosen(),
        load: restored.load
      });
      expect(restored.init.mock.calls[0][1].disable_session_recording).toBe(true);
      expect(restored.startSessionRecording.mock.calls).toEqual([]);
      win.dispatchEvent(new Event("pointermove"));
      expect(restored.startSessionRecording.mock.calls).toEqual([[]]);

      await (
        await fresh()
      ).initAnalytics({
        token: "phc_test",
        host: "https://e.example.dev",
        choice: chosen({ justChosen: true }),
        load: justAllowed.load
      });
      expect(justAllowed.startSessionRecording.mock.calls).toEqual([[]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records only sessions the visitor allowed", async () => {
    const denied = fakeSdk();
    const allowed = fakeSdk();
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    try {
      await (
        await fresh()
      ).initAnalytics({
        token: "phc_test",
        host: "https://e.example.dev",
        choice: chosen({ replay: false }),
        load: denied.load
      });
      await (
        await fresh()
      ).initAnalytics({
        token: "phc_test",
        host: "https://e.example.dev",
        choice: chosen(),
        load: allowed.load
      });
      win.dispatchEvent(new Event("pointermove"));
      expect(denied.startSessionRecording.mock.calls).toEqual([]);
      expect(allowed.startSessionRecording.mock.calls).toEqual([[]]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("records an acceptance with its consent id and revision", async () => {
    const { opt_in_capturing, load } = fakeSdk();
    await (
      await fresh()
    ).initAnalytics({
      token: "phc_test",
      host: "https://e.example.dev",
      choice: chosen({ justChosen: true }),
      load
    });
    expect(opt_in_capturing.mock.calls).toEqual([
      [{ captureProperties: { consent_id: "consent-1", consent_revision: "20261125" } }]
    ]);
  });

  it("restores an earlier acceptance without recording it again, unless PostHog lost it", async () => {
    const remembered = fakeSdk();
    remembered.get_explicit_consent_status.mockReturnValue("granted");
    await (
      await fresh()
    ).initAnalytics({
      token: "phc_test",
      host: "https://e.example.dev",
      choice: chosen(),
      load: remembered.load
    });
    const forgotten = fakeSdk();
    await (
      await fresh()
    ).initAnalytics({
      token: "phc_test",
      host: "https://e.example.dev",
      choice: chosen(),
      load: forgotten.load
    });
    expect(remembered.opt_in_capturing.mock.calls).toEqual([]);
    expect(forgotten.opt_in_capturing.mock.calls).toEqual([
      [{ captureProperties: { consent_id: "consent-1", consent_revision: "20261125" } }]
    ]);
  });

  it("opts a visitor who rejects out, and still hands their events to PostHog to count anonymously", async () => {
    const { opt_out_capturing, opt_in_capturing, capture, load } = fakeSdk();
    const ph = await fresh();
    await boot(ph, { choice: chosen({ analytics: false, replay: false, justChosen: true }), load });
    ph.track("resume_download");
    expect(opt_out_capturing.mock.calls).toEqual([[]]);
    expect(opt_in_capturing.mock.calls).toEqual([]);
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
  });

  it("applies a change of mind to the SDK it already loaded", async () => {
    const { opt_out_capturing, stopSessionRecording, init, load } = fakeSdk();
    const ph = await fresh();
    await boot(ph, { load });
    await boot(ph, { choice: chosen({ analytics: false, replay: false, justChosen: true }), load });
    expect(init.mock.calls).toHaveLength(1);
    expect(opt_out_capturing.mock.calls).toEqual([[]]);
    expect(stopSessionRecording.mock.calls).toEqual([[]]);
  });

  it("replays events captured before the SDK finished loading", async () => {
    const { capture, register, load } = fakeSdk();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const ph = await fresh();
    const booting = boot(ph, {
      load: async () => {
        await gate;
        return load();
      }
    });
    ph.track("resume_download");
    ph.tag("theme", "dark");
    expect(capture).not.toHaveBeenCalled();
    release();
    await booting;
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
    expect(register.mock.calls).toEqual([[{ theme: "dark" }]]);
  });

  it("delivers every event once, in order, whichever events the SDK load lands between", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.scheduler(),
        fc.array(fc.constantFrom("resume_download", "social_click", "chat_open"), {
          maxLength: 6
        }),
        async (s, events) => {
          // afterEach runs once per test, not once per run.
          delete globalThis.posthog;
          const { capture, load } = fakeSdk();
          const ph = await fresh();
          const booting = boot(ph, { load: s.scheduleFunction(load) });
          s.scheduleSequence(
            events.map(name => ({ label: name, builder: async () => ph.track(name) }))
          );
          await s.waitIdle();
          await booting;
          expect(capture.mock.calls.map(([event]) => event)).toEqual(events);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("does nothing until it has both a token and a host", async () => {
    const { init, load } = fakeSdk();
    const ph = await fresh();
    await ph.initAnalytics({
      token: "",
      host: "https://e.example.dev",
      choice: chosen(),
      load
    });
    await ph.initAnalytics({ token: "phc_test", host: "", choice: chosen(), load });
    await boot(ph, { load });
    expect(init.mock.calls.map(([token]) => token)).toEqual(["phc_test"]);
  });

  it("drops what it buffered when the SDK fails to load, and can boot later", async () => {
    const { capture, load } = fakeSdk();
    const ph = await fresh();
    const failing = boot(ph, {
      load: async () => {
        throw new Error("chunk load failed");
      }
    });
    ph.track("resume_download");
    await failing;
    await boot(ph, { load });
    ph.track("social_click");
    expect(capture.mock.calls).toEqual([["social_click", undefined]]);
  });
});

describe("bootAnalytics", () => {
  const page = (head: string) => doc(`<html><head>${head}</head><body></body></html>`);
  const configured = () => {
    const d = page(
      `<meta name="ph-token" content="phc_test"><meta name="ph-host" content="https://e.example.dev/">`
    );
    const win = d.defaultView;
    assert(win, "fixture page has no window");
    return { d, win };
  };
  const consentPrompt = () => {
    const showSettings = vi.fn<() => void>();
    let answer: ((choice: ConsentChoice) => void) | undefined;
    const ask = async (onChoice: (choice: ConsentChoice) => void) => {
      answer = onChoice;
      return { showSettings };
    };
    const choose = (choice: ConsentChoice) => {
      assert(answer, "the consent prompt was never shown");
      answer(choice);
    };
    return { ask, choose, showSettings };
  };
  const answeredWith =
    (choice: ConsentChoice) => async (onChoice: (choice: ConsentChoice) => void) => {
      onChoice(choice);
      return { showSettings: () => {} };
    };

  it("keeps the SDK out of the page until the visitor's first input, then sends events", async () => {
    const { init, capture, load: loadFake } = fakeSdk();
    let loads = 0;
    const load = async () => {
      loads++;
      return loadFake();
    };
    const ask = answeredWith(chosen());
    const ph = await fresh();
    await ph.bootAnalytics({ root: page(""), load, ask });
    const { d, win } = configured();
    vi.stubGlobal("document", d);
    try {
      const booting = ph.bootAnalytics({ load, ask });
      expect(loads).toBe(0);
      win.dispatchEvent(new win.Event("pointerdown"));
      await booting;
    } finally {
      vi.unstubAllGlobals();
    }

    expect(loads).toBe(1);
    expect(init.mock.calls.map(([token, config]) => [token, config.api_host])).toEqual([
      ["phc_test", "https://e.example.dev"]
    ]);
    ph.track("cta_click", { where: "hero" });
    expect(capture.mock.calls).toEqual([["cta_click", { where: "hero" }]]);
  });

  it("sends nothing until the visitor chooses, then opts in before sending what it held", async () => {
    const sent: string[] = [];
    const { opt_in_capturing, capture, load } = fakeSdk();
    opt_in_capturing.mockImplementation(() => sent.push("$opt_in"));
    capture.mockImplementation(event => sent.push(event));
    const { ask, choose } = consentPrompt();
    const { d, win } = configured();
    const ph = await fresh();
    const booting = ph.bootAnalytics({ root: d, load, ask });
    win.dispatchEvent(new win.Event("pointerdown"));
    await booting;
    ph.track("resume_download");
    expect(sent).toEqual([]);

    choose(chosen({ justChosen: true }));
    await vi.waitFor(() => expect(sent).toEqual(["$opt_in", "resume_download"]));
  });

  it("opens the cookie settings even before the banner has loaded", async () => {
    const { load } = fakeSdk();
    const { ask, showSettings } = consentPrompt();
    const { d } = configured();
    const ph = await fresh();
    void ph.bootAnalytics({ root: d, load, ask });
    ph.openConsentSettings();
    await vi.waitFor(() => expect(showSettings.mock.calls).toEqual([[]]));
  });

  it("drops what it held, errors included, when the banner fails to load", async () => {
    const { capture, captureException, load } = fakeSdk();
    const { d, win } = configured();
    const ph = await fresh();
    const booting = ph.bootAnalytics({
      root: d,
      load,
      ask: async () => {
        throw new Error("consent chunk failed");
      }
    });
    ph.track("resume_download");
    win.dispatchEvent(new win.Event("pointerdown"));
    await booting;
    win.dispatchEvent(Object.assign(new win.Event("error"), { error: new Error("later") }));
    await boot(ph, { load });
    expect(capture.mock.calls).toEqual([]);
    expect(captureException.mock.calls).toEqual([]);
    ph.track("social_click");
    expect(capture.mock.calls).toEqual([["social_click", undefined]]);
  });

  it("buffers errors and rejections thrown before the SDK boots and replays them", async () => {
    const { captureException, load } = fakeSdk();
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const { d, win } = configured();
    const ph = await fresh();
    const booting = ph.bootAnalytics({
      root: d,
      ask: answeredWith(chosen({ analytics: false, replay: false })),
      load: async () => {
        await gate;
        return load();
      }
    });
    const err = new Error("hydration failed");
    const reason = new Error("fetch failed");
    win.dispatchEvent(Object.assign(new win.Event("error"), { error: err }));
    win.dispatchEvent(Object.assign(new win.Event("unhandledrejection"), { reason }));
    win.dispatchEvent(new win.Event("pointerdown"));
    release();
    await booting;
    expect(captureException.mock.calls).toEqual([
      [err, undefined],
      [reason, undefined]
    ]);
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
