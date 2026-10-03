// PostHog events and error tracking for both apps. Every export is safe to
// call unconditionally: no-op without config (dev, CI), buffered while the SDK
// loads, failures swallowed. Event names are snake_case `<surface>_<action>`.
// PII: never pass anything a visitor typed (chat messages, search queries).

import { onFirstInteraction } from "./first-interaction";

interface PostHog {
  capture(event: string, properties?: Record<string, string>): void;
  captureException(error: unknown, properties?: Record<string, string>): void;
  register(properties: Record<string, string>): void;
  init(token: string, config: Record<string, unknown>): void;
  startSessionRecording(): void;
}

/** Injectable for tests; production dynamic-imports the real browser SDK. */
type SdkLoader = () => Promise<PostHog>;

const loadSdk: SdkLoader = () => import("posthog-js").then(m => m.default);

// Checked before the global in case something reassigns window.posthog.
let sdk: PostHog | null = null;

// Non-null only while the SDK is loading, so nothing accumulates in dev/CI.
let pending: Array<(ph: PostHog) => void> | null = null;

// Detaches bootAnalytics' pre-SDK error listeners; PostHog's autocapture
// takes over once initAnalytics settles.
let stopEarlyErrors: (() => void) | null = null;

const stopEarlyErrorCapture = () => {
  stopEarlyErrors?.();
  stopEarlyErrors = null;
};

const client = (): PostHog | null => {
  if (sdk) return sdk;
  const p = (globalThis as { posthog?: Partial<PostHog> }).posthog;
  return typeof p?.capture === "function" && typeof p.register === "function"
    ? (p as PostHog)
    : null;
};

// Run now if the SDK is up, buffer while it loads, drop otherwise.
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

/** Super property, not person property: visitors are anonymous. */
export function tag(key: string, value: string): void {
  if (!value.trim()) return;
  send(ph => ph.register({ [key]: value }));
}

export function track(event: string, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.capture(event, cleaned));
}

/** For errors caught on purpose; uncaught ones are captured automatically. */
export function reportError(error: unknown, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.captureException(error, cleaned));
}

const TRACKED = new WeakSet<object>();

/**
 * Delegated click tracking via `data-ph-event`, plus optional `data-ph-prop` /
 * `data-ph-value`. One listener per document, so later-rendered islands work.
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

/** PII: strips the blog's `q` (visitor search text) and `tag` params from /blog URLs. */
export const redactBlogFilters = (url: string): string => {
  if (!url.includes("?")) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/blog")) return url;
    if (!parsed.searchParams.has("q") && !parsed.searchParams.has("tag")) return url;
    parsed.searchParams.delete("q");
    parsed.searchParams.delete("tag");
    return parsed.toString();
  } catch {
    // not an absolute URL
    return url;
  }
};

/** No-ops without token/host; replays anything buffered during the load. */
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
      // the toolbar needs PostHog's real domain, not the proxy
      ui_host: "https://us.posthog.com",
      // Replay starts on first interaction (below) to keep the heavy recorder
      // out of Lighthouse's blocking time.
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
        // PII: sent chat messages render as text, which input masking misses
        maskTextSelector: "[data-ph-mask]"
      },
      // unused extensions the SDK would otherwise fetch after boot
      disable_surveys: true,
      capture_dead_clicks: false,
      // bootAnalytics' listeners cover the window before this; they are
      // detached below so nothing is captured twice.
      capture_exceptions: true,
      persistence: "localStorage+cookie",
      capture_pageview: true,
      // PII: scrub blog search text from every URL-valued property
      sanitize_properties: (properties: Record<string, unknown>) => {
        for (const key of Object.keys(properties)) {
          const value = properties[key];
          if (typeof value === "string") properties[key] = redactBlogFilters(value);
        }
        return properties;
      }
    });
    sdk = ph;
    stopEarlyErrorCapture();
    const win = (globalThis as { window?: EventTarget }).window;
    if (win) {
      onFirstInteraction(() => {
        try {
          ph.startSessionRecording();
        } catch {
          // recorder blocked or offline; events still flow
        }
      }, win);
    }
    // the PostHog toolbar looks for the global
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
    stopEarlyErrorCapture();
    pending = null;
  }
}

// Long enough to land outside Lighthouse's trace, short enough to count readers
// who never interact.
const SDK_LOAD_FALLBACK_MS = 10_000;

/**
 * Run `load` once, on first input or after `fallbackMs`. Loading on idle put
 * the ~90 KB SDK inside Lighthouse's measured window.
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
 * Reads config from <meta> tags (`document.currentScript` is null in Astro's
 * module scripts) and schedules the SDK. Also buffers uncaught errors until
 * the SDK boots, since its own autocapture misses everything before that.
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
  const win = doc.defaultView;
  if (win && !stopEarlyErrors) {
    // Buffering must start now: onError pushes straight into pending.
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
