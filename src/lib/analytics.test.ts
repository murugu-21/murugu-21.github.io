import {afterEach, describe, expect, it, vi} from "vitest";
import {parseHTML} from "linkedom";

import {initClickTracking, tag, track} from "./analytics";

// The real snippet defines window.posthog as a stub whose methods queue until
// array.js loads (see ../layouts/Layout.astro); tests stand in spies and
// delete the global again so the "not loaded" cases run on a clean slate.
const withPostHog = () => {
  const capture = vi.fn();
  const register = vi.fn();
  (globalThis as {posthog?: unknown}).posthog = {capture, register};
  return {capture, register};
};

afterEach(() => {
  delete (globalThis as {posthog?: unknown}).posthog;
});

describe("track", () => {
  it("captures the event", () => {
    const {capture} = withPostHog();
    track("resume_download");
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
  });

  it("captures properties alongside the event", () => {
    const {capture} = withPostHog();
    track("social_click", {social: "github"});
    expect(capture.mock.calls).toEqual([["social_click", {social: "github"}]]);
  });

  it("drops properties with a blank value", () => {
    const {capture} = withPostHog();
    track("blog_card_click", {post: "", tag: "  "});
    expect(capture.mock.calls).toEqual([["blog_card_click", undefined]]);
  });

  it("does nothing when the snippet was never loaded", () => {
    expect(() => track("resume_download")).not.toThrow();
  });

  it("swallows failures from inside posthog", () => {
    (globalThis as {posthog?: unknown}).posthog = {
      capture: () => {
        throw new Error("blocked");
      },
      register: () => {}
    };
    expect(() => track("resume_download")).not.toThrow();
  });

  it("ignores a half-initialised global", () => {
    (globalThis as {posthog?: unknown}).posthog = {};
    expect(() => track("resume_download")).not.toThrow();
  });
});

describe("tag", () => {
  // Super properties, not person properties: visitors here are anonymous, and
  // these describe the session rather than an identified user.
  it("registers a super property", () => {
    const {register, capture} = withPostHog();
    tag("theme", "dark");
    expect(register.mock.calls).toEqual([[{theme: "dark"}]]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("ignores a blank value", () => {
    const {register} = withPostHog();
    tag("theme", "");
    expect(register).not.toHaveBeenCalled();
  });
});

describe("initClickTracking", () => {
  const dom = (body: string) =>
    parseHTML(`<html><body>${body}</body></html>`).document;
  const click = (el: {dispatchEvent: (e: Event) => void}, doc: Document) => {
    const Ctor = (doc.defaultView as unknown as {Event: typeof Event}).Event;
    el.dispatchEvent(new Ctor("click", {bubbles: true}));
  };

  it("captures the annotated event when the link is clicked", () => {
    const {capture} = withPostHog();
    const doc = dom(`<a id="cv" data-ph-event="resume_download">CV</a>`);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("cv")!, doc as unknown as Document);
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
  });

  it("resolves the nearest annotated ancestor of the click target", () => {
    const {capture} = withPostHog();
    const doc = dom(
      `<a data-ph-event="social_click" data-ph-prop="social" data-ph-value="github"><svg id="glyph"></svg></a>`
    );
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("glyph")!, doc as unknown as Document);
    expect(capture.mock.calls).toEqual([["social_click", {social: "github"}]]);
  });

  it("ignores clicks with no annotated ancestor", () => {
    const {capture} = withPostHog();
    const doc = dom(`<a id="plain" href="/">Home</a>`);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("plain")!, doc as unknown as Document);
    expect(capture).not.toHaveBeenCalled();
  });

  it("attaches one listener however many times it is called", () => {
    const {capture} = withPostHog();
    const doc = dom(`<a id="cv" data-ph-event="resume_download"></a>`);
    initClickTracking(doc as unknown as Document);
    initClickTracking(doc as unknown as Document);
    click(doc.getElementById("cv")!, doc as unknown as Document);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("initAnalytics", () => {
  // initAnalytics keeps module state (the booted SDK, the replay buffer), so
  // each test gets a fresh module instance rather than leaking into the next.
  const fresh = async () => {
    vi.resetModules();
    return await import("./analytics");
  };

  // The real loader dynamic-imports posthog-js on idle; tests inject a fake so
  // the browser SDK never has to run here.
  const fakeSdk = () => {
    const capture = vi.fn();
    const register = vi.fn();
    const init = vi.fn();
    return {sdk: {capture, register, init}, capture, register, init};
  };

  it("initialises the SDK with the token and the proxy host", async () => {
    const {sdk, init} = fakeSdk();
    const ph = await fresh();
    await ph.initAnalytics(
      "phc_test",
      "https://e.example.dev",
      async () => sdk
    );
    expect(init).toHaveBeenCalledTimes(1);
    const [token, config] = init.mock.calls[0];
    expect(token).toBe("phc_test");
    expect(config.api_host).toBe("https://e.example.dev");
    expect(config.ui_host).toBe("https://us.posthog.com");
  });

  // PostHog owns events; Clarity owns replay (see the layouts). Recording in
  // both would double the client cost and burn PostHog's replay quota on
  // footage nobody watches.
  it("leaves session replay to Clarity", async () => {
    const {sdk, init} = fakeSdk();
    const ph = await fresh();
    await ph.initAnalytics(
      "phc_test",
      "https://e.example.dev",
      async () => sdk
    );
    expect(init.mock.calls[0][1].disable_session_recording).toBe(true);
  });

  it("replays events captured before the SDK finished loading", async () => {
    const {sdk, capture, register} = fakeSdk();
    let release: (() => void) | undefined;
    const gate = new Promise<void>(r => (release = r));
    const ph = await fresh();
    const booting = ph.initAnalytics(
      "phc_test",
      "https://e.example.dev",
      async () => {
        await gate;
        return sdk;
      }
    );
    // Nothing can have reached the SDK yet — it does not exist.
    ph.track("resume_download");
    ph.tag("theme", "dark");
    expect(capture).not.toHaveBeenCalled();
    release!();
    await booting;
    expect(capture.mock.calls).toEqual([["resume_download", undefined]]);
    expect(register.mock.calls).toEqual([[{theme: "dark"}]]);
  });

  it("drops events when analytics was never initialised", () => {
    // No initAnalytics call: local dev and CI, where there is no token.
    expect(() => track("resume_download")).not.toThrow();
    expect(() => tag("theme", "dark")).not.toThrow();
  });

  it("does nothing without a token or host", async () => {
    const {sdk, init} = fakeSdk();
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
  const fresh = async () => {
    vi.resetModules();
    return await import("./analytics");
  };
  const docWith = (metas: string) =>
    parseHTML(`<html><head>${metas}</head><body></body></html>`).document;

  it("reads the token and host from the page's meta tags", async () => {
    const init = vi.fn();
    const doc = docWith(
      `<meta name="ph-token" content="phc_test"><meta name="ph-host" content="https://e.example.dev">`
    );
    const ph = await fresh();
    await ph.bootAnalytics(doc as unknown as Document, async () => ({
      capture: vi.fn(),
      register: vi.fn(),
      init
    }));
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toBe("phc_test");
    expect(init.mock.calls[0][1].api_host).toBe("https://e.example.dev");
  });

  it("no-ops when the meta tags are absent (local dev, CI)", async () => {
    const init = vi.fn();
    const ph = await fresh();
    await ph.bootAnalytics(docWith("") as unknown as Document, async () => ({
      capture: vi.fn(),
      register: vi.fn(),
      init
    }));
    expect(init).not.toHaveBeenCalled();
  });
});
