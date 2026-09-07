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
//   - When it is emitted, the snippet's stub queues calls until array.js
//     finishes loading on idle, so there is no "too early" to worry about.
// Failures are swallowed: analytics must never break a click path.
//
// Event names are snake_case `<surface>_<action>`. Never pass anything a
// visitor typed (chat messages, search queries) — no PII goes to PostHog.

interface PostHog {
  capture(event: string, properties?: Record<string, string>): void;
  register(properties: Record<string, string>): void;
  init(token: string, config: Record<string, unknown>): void;
}

/** Injectable for tests; production dynamic-imports the real browser SDK. */
export type SdkLoader = () => Promise<PostHog>;

const loadSdk: SdkLoader = () =>
  import("posthog-js").then(m => m.default as unknown as PostHog);

// Set once initAnalytics resolves. Checked before the global so a booted SDK
// is used even if something else reassigns window.posthog.
let sdk: PostHog | null = null;

// Non-null only while the SDK is loading: calls made in that window are held
// here and replayed on arrival. Null when analytics was never initialised
// (local dev, CI), so nothing accumulates.
let pending: Array<(ph: PostHog) => void> | null = null;

const client = (): PostHog | null => {
  if (sdk) return sdk;
  const p = (globalThis as {posthog?: Partial<PostHog>}).posthog;
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
const clean = (
  props?: Record<string, string>
): Record<string, string> | undefined => {
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
  send(ph => ph.register({[key]: value}));
}

/** Capture a custom event, with optional properties describing it. */
export function track(event: string, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.capture(event, cleaned));
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
  const doc = root ?? (globalThis as {document?: Document}).document;
  if (!doc || TRACKED.has(doc)) return;
  TRACKED.add(doc);
  doc.addEventListener(
    "click",
    event => {
      const target = event.target as Element | null;
      const el = target?.closest?.<HTMLElement>("[data-ph-event]");
      const name = el?.dataset.phEvent;
      if (!el || !name) return;
      const {phProp, phValue} = el.dataset;
      track(name, phProp && phValue ? {[phProp]: phValue} : undefined);
    },
    {passive: true}
  );
}

/**
 * Load posthog-js and point it at the proxy. Called from the layouts with the
 * build-time POST_HOG_TOKEN / POST_HOG_URL; with either missing (local dev,
 * CI) it no-ops and every track/tag call is dropped.
 *
 * The import is dynamic so the SDK is a separate chunk fetched after the page
 * is interactive rather than part of the initial bundle — the layouts call
 * this from requestIdleCallback. Anything captured while it loads is buffered
 * and replayed, so an early click is not lost.
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
      // Session replay is Microsoft Clarity's job here (see the layouts):
      // its recording UI is the better debugging tool and it is unmetered,
      // where PostHog's replay is quota'd. Recording in both would double the
      // client cost for footage nobody watches. PostHog keeps the events.
      disable_session_recording: true,
      persistence: "localStorage+cookie",
      capture_pageview: true
    });
    sdk = ph;
    // Expose it the way the snippet would, so the PostHog toolbar can find it.
    (globalThis as {posthog?: PostHog}).posthog = ph;
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
    pending = null;
  }
}

/**
 * Read the PostHog config the layouts render into <meta> tags and load the SDK
 * once the page is interactive. A meta tag rather than a data attribute on the
 * script element: Astro bundles `<script>` as a module, and
 * `document.currentScript` is null in module scope.
 *
 * Idle-scheduled because the SDK is a few tens of KB gzipped and nothing on
 * the page waits for it — calls made before it lands are buffered by
 * initAnalytics and replayed.
 */
export function bootAnalytics(
  root?: Document,
  load?: SdkLoader
): Promise<void> {
  const doc = root ?? (globalThis as {document?: Document}).document;
  if (!doc) return Promise.resolve();
  const meta = (name: string) =>
    doc
      .querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
      ?.getAttribute("content") ?? undefined;
  const token = meta("ph-token");
  const host = meta("ph-host");
  if (!token || !host) return Promise.resolve();
  // Tests drive this synchronously; the browser waits for idle.
  if (root || load) return initAnalytics(token, host, load);
  const boot = () => void initAnalytics(token, host);
  const g = globalThis as {
    requestIdleCallback?: (cb: () => void, opts?: {timeout: number}) => number;
  };
  if (g.requestIdleCallback) g.requestIdleCallback(boot, {timeout: 3000});
  else setTimeout(boot, 2000);
  return Promise.resolve();
}
