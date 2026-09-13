// PostHog custom events, shared by the portfolio and the blog (see
// ../layouts/Layout.astro and ../blog/components/BaseHead.astro for where the
// snippet is injected).
//
// Ingestion goes through https://e.murugappan.dev — PostHog's managed reverse
// proxy on our own domain, a CNAME to their infrastructure. From here it is
// just the api_host the snippet was initialised with.
//
// Two things make every function here safe to call unconditionally:
//   - The snippet is only emitted when POST_HOG_TOKEN and POST_HOG_URL are
//     set, so on local dev and CI `posthog` is absent and these all no-op.
//   - When it is emitted, calls made before the SDK lands are buffered and
//     replayed once it does, so there is no "too early" to worry about.
// Failures are swallowed: analytics must never break a click path.
//
// Event names are snake_case `<surface>_<action>`. Never pass anything a
// visitor typed (chat messages, search queries) — no PII goes to PostHog.
//
// The same SDK does error tracking (see initAnalytics and bootAnalytics):
// uncaught errors and rejections are captured automatically, and reportError
// is the explicit channel for failures the code catches itself.

import { onFirstInteraction } from "./first-interaction";

interface PostHog {
  capture(event: string, properties?: Record<string, string>): void;
  captureException(error: unknown, properties?: Record<string, string>): void;
  register(properties: Record<string, string>): void;
  init(token: string, config: Record<string, unknown>): void;
  startSessionRecording(): void;
}

/** Injectable for tests; production dynamic-imports the real browser SDK. */
export type SdkLoader = () => Promise<PostHog>;

const loadSdk: SdkLoader = () => import("posthog-js").then(m => m.default as unknown as PostHog);

// Set once initAnalytics resolves. Checked before the global so a booted SDK
// is used even if something else reassigns window.posthog.
let sdk: PostHog | null = null;

// Non-null only while the SDK is loading: calls made in that window are held
// here and replayed on arrival. Null when analytics was never initialised
// (local dev, CI), so nothing accumulates.
let pending: Array<(ph: PostHog) => void> | null = null;

// Detaches the listeners bootAnalytics attaches for errors thrown before the
// SDK boots. Set only in the browser; cleared by initAnalytics (success or
// failure) so PostHog's own exception autocapture owns them from then on.
let stopEarlyErrors: (() => void) | null = null;

const client = (): PostHog | null => {
  if (sdk) return sdk;
  const p = (globalThis as { posthog?: Partial<PostHog> }).posthog;
  return typeof p?.capture === "function" && typeof p.register === "function"
    ? (p as PostHog)
    : null;
};

// Run now if the SDK is up, buffer if it is still loading, drop otherwise.
// Failures are swallowed: analytics must never break the caller.
const send = (fn: (ph: PostHog) => void): void => {
  const ph = client();
  if (!ph) {
    pending?.push(fn);
    return;
  }
  try {
    fn(ph);
  } catch {
    // storage blocked, SDK swapped out by consent tooling
  }
};

// Blank values carry no signal and clutter PostHog's property list.
const clean = (props?: Record<string, string>): Record<string, string> | undefined => {
  const kept = Object.entries(props ?? {}).filter(([, v]) => v.trim());
  return kept.length ? Object.fromEntries(kept) : undefined;
};

/**
 * Register a super property — attached to every subsequent event this session.
 * Session context (theme, read-aloud backend) rather than an action. Super
 * properties, not person properties: visitors here are anonymous.
 */
export function tag(key: string, value: string): void {
  if (!value.trim()) return;
  send(ph => ph.register({ [key]: value }));
}

/** Capture a custom event, with optional properties describing it. */
export function track(event: string, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.capture(event, cleaned));
}

/**
 * Report an error the code caught itself — a malformed server frame, a
 * diagram that failed to render. Uncaught errors and unhandled promise
 * rejections are captured automatically (see `capture_exceptions` in
 * initAnalytics, and the buffering listeners bootAnalytics attaches), so this
 * is only for failures swallowed on purpose that should not be invisible.
 *
 * Like track/tag it no-ops without the SDK and buffers while it loads.
 */
export function reportError(error: unknown, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.captureException(error, cleaned));
}

const TRACKED = new WeakSet<object>();

/**
 * Delegated click tracking for plain markup: annotate an anchor or button with
 *
 *   data-ph-event="social_click"     the event to capture
 *   data-ph-prop="social"            optional property key…
 *   data-ph-value="github"           …and its value
 *
 * and one listener per document handles it, including elements rendered later
 * by a React island. Links stay plain <a>s with no JS in their nav path.
 */
export function initClickTracking(root?: Document): void {
  const doc = root ?? (globalThis as { document?: Document }).document;
  if (!doc || TRACKED.has(doc)) return;
  TRACKED.add(doc);
  doc.addEventListener(
    "click",
    event => {
      const target = event.target as Element | null;
      const el = target?.closest?.<HTMLElement>("[data-ph-event]");
      const name = el?.dataset.phEvent;
      if (!el || !name) return;
      const { phProp, phValue } = el.dataset;
      track(name, phProp && phValue ? { [phProp]: phValue } : undefined);
    },
    { passive: true }
  );
}

/**
 * Load posthog-js and point it at the proxy. Called from the layouts with the
 * build-time POST_HOG_TOKEN / POST_HOG_URL; with either missing (local dev,
 * CI) it no-ops and every track/tag call is dropped.
 *
 * The import is dynamic so the SDK is a separate chunk fetched after the page
 * is interactive rather than part of the initial bundle — bootAnalytics
 * schedules it (see scheduleSdkLoad). Anything captured while it loads is
 * buffered and replayed, so an early click is not lost.
 */
export async function initAnalytics(
  token: string | undefined,
  host: string | undefined,
  load: SdkLoader = loadSdk
): Promise<void> {
  if (!token?.trim() || !host?.trim() || sdk) return;
  pending ??= [];
  try {
    const ph = await load();
    ph.init(token.trim(), {
      api_host: host.trim().replace(/\/$/, ""),
      // PostHog's real domain, not the proxy — the toolbar needs it.
      ui_host: "https://us.posthog.com",
      // Session replay starts on the visitor's first interaction (below), not
      // at boot. The recorder is the SDK's heaviest extension, and loading it
      // in the idle window right after paint put its evaluation inside what
      // Lighthouse scores as blocking time; a visitor who never touches the
      // page has nothing worth replaying anyway. Recording must also be
      // switched on in the PostHog project's replay settings.
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        // Sent chat messages are re-rendered as text, which input masking
        // does not cover — the transcript carries this attribute.
        maskTextSelector: "[data-ph-mask]"
      },
      // Extensions this site does not use. Each is a separate script the SDK
      // would otherwise fetch and evaluate after boot (surveys alone was 34 KB
      // and a 67 ms task in the Lighthouse trace).
      disable_surveys: true,
      capture_dead_clicks: false,
      // Error tracking: unhandled errors and unhandled promise rejections are
      // captured as $exception events. The SDK fetches one more small script
      // to wrap the handlers, which is why this rides the delayed SDK load
      // rather than page start — the listeners bootAnalytics attaches cover
      // the window before it, and are detached here so nothing is captured
      // twice. Error tracking must also be switched on in the project.
      capture_exceptions: true,
      persistence: "localStorage+cookie",
      capture_pageview: true
    });
    sdk = ph;
    stopEarlyErrors?.();
    stopEarlyErrors = null;
    const win = (globalThis as { window?: EventTarget }).window;
    if (win) {
      onFirstInteraction(() => {
        try {
          ph.startSessionRecording();
        } catch {
          // recorder blocked or offline — events still flow
        }
      }, win);
    }
    // Expose it the way the snippet would, so the PostHog toolbar can find it.
    (globalThis as { posthog?: PostHog }).posthog = ph;
    const queued = pending;
    pending = null;
    for (const fn of queued) {
      try {
        fn(ph);
      } catch {
        // one bad replay must not drop the rest
      }
    }
  } catch {
    // SDK chunk blocked or offline: stop buffering and let calls no-op.
    stopEarlyErrors?.();
    stopEarlyErrors = null;
    pending = null;
  }
}

// How long a visitor who never interacts waits before the SDK loads anyway.
// Lighthouse stops observing a couple of seconds after the page goes quiet
// (it runs unthrottled and simulates the slow network afterwards), so this
// lands well outside its trace while still counting a visitor who only reads.
const SDK_LOAD_FALLBACK_MS = 10_000;

/**
 * Run `load` once: on the visitor's first input, or after `fallbackMs` if none
 * arrives. The SDK is ~90 KB gzipped with a 4x-throttled evaluation of a few
 * hundred ms; scheduled on idle it was fetched and run inside the window
 * Lighthouse measures, and flagged as unused and legacy JavaScript. Nothing on
 * the page waits for it — calls made before it lands are buffered by
 * initAnalytics and replayed — so it can wait for the same signal as the chat
 * island and session replay (see ./first-interaction.ts).
 */
export function scheduleSdkLoad(
  load: () => void,
  target: EventTarget,
  fallbackMs: number = SDK_LOAD_FALLBACK_MS
): void {
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    cancel();
    clearTimeout(timer);
    load();
  };
  const cancel = onFirstInteraction(once, target);
  const timer = setTimeout(once, fallbackMs);
}

/**
 * Read the PostHog config the layouts render into <meta> tags and schedule the
 * SDK load (scheduleSdkLoad). A meta tag rather than a data attribute on the
 * script element: Astro bundles `<script>` as a module, and
 * `document.currentScript` is null in module scope.
 *
 * This also starts error tracking. The SDK waits for the first interaction, so
 * its own exception autocapture misses everything before it — hydration
 * failures, a chunk that would not fetch — which is exactly the window the
 * errors worth seeing come from. Uncaught errors and unhandled rejections are
 * buffered through reportError from here, replayed the moment the SDK boots,
 * then these listeners are detached in favour of PostHog's (initAnalytics).
 */
export function bootAnalytics(root?: Document, load?: SdkLoader): Promise<void> {
  const doc = root ?? (globalThis as { document?: Document }).document;
  if (!doc) return Promise.resolve();
  const meta = (name: string) =>
    doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.getAttribute("content") ??
    undefined;
  const token = meta("ph-token");
  const host = meta("ph-host");
  if (!token || !host) return Promise.resolve();
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (win && !stopEarlyErrors) {
    // Buffering has to start now, not when the SDK load is scheduled: onError
    // fires straight into pending (see send), which nothing resets until the
    // SDK arrives or fails.
    pending ??= [];
    const onError = (event: ErrorEvent) => reportError(event.error ?? new Error(event.message));
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
    win.addEventListener("error", onError);
    win.addEventListener("unhandledrejection", onRejection);
    stopEarlyErrors = () => {
      win.removeEventListener("error", onError);
      win.removeEventListener("unhandledrejection", onRejection);
    };
  }
  // Tests drive this synchronously; the browser waits for the visitor.
  if (root || load) return initAnalytics(token, host, load);
  scheduleSdkLoad(() => void initAnalytics(token, host), win ?? window);
  return Promise.resolve();
}
