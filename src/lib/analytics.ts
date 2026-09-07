// Microsoft Clarity custom events and tags, shared by the portfolio and the
// blog (see ../layouts/Layout.astro and ../blog/components/BaseHead.astro for
// where the tag itself is injected).
//
// Two things make every function here safe to call unconditionally:
//   - The tag is only emitted when PUBLIC_CLARITY_PROJECT_ID is set, so on
//     local dev and CI `clarity` is simply absent and these all no-op.
//   - When it *is* emitted, the queue stub buffers calls until the real tag
//     finishes loading on idle, so there is no "too early" to worry about.
// Failures are swallowed: analytics must never break a click path.
//
// Event names are snake_case `<surface>_<action>`. Never pass anything a
// visitor typed (chat messages, search queries) — no PII goes to Clarity.

type ClarityFn = (...args: unknown[]) => void;

const clarity = (): ClarityFn | null => {
  const fn = (globalThis as {clarity?: unknown}).clarity;
  return typeof fn === "function" ? (fn as ClarityFn) : null;
};

const send = (...args: unknown[]): void => {
  const fn = clarity();
  if (!fn) return;
  try {
    fn(...args);
  } catch {
    // storage blocked, tag 400ing, consent tooling swapping the stub out
  }
};

/** Set a session tag used to filter and segment recordings in Clarity. */
export function tag(key: string, value: string): void {
  if (!value.trim()) return;
  send("set", key, value);
}

/** Fire a custom event, optionally setting tags that describe it first. */
export function track(event: string, tags?: Record<string, string>): void {
  for (const [key, value] of Object.entries(tags ?? {})) tag(key, value);
  send("event", event);
}

/**
 * Ask Clarity to keep this session's recording. Reserved for the handful of
 * moments worth watching back — Clarity samples recordings otherwise.
 */
export function upgrade(reason: string): void {
  send("upgrade", reason);
}

const TRACKED = new WeakSet<object>();

/**
 * Delegated click tracking for plain markup: annotate an anchor or button with
 *
 *   data-clarity-event="social_click"     the event to fire
 *   data-clarity-tag="social"             optional tag key…
 *   data-clarity-value="github"           …and its value
 *   data-clarity-upgrade                  also keep the session recording
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
      const el = target?.closest?.<HTMLElement>("[data-clarity-event]");
      const name = el?.dataset.clarityEvent;
      if (!el || !name) return;
      const {clarityTag, clarityValue, clarityUpgrade} = el.dataset;
      track(
        name,
        clarityTag && clarityValue ? {[clarityTag]: clarityValue} : undefined
      );
      if (clarityUpgrade !== undefined) upgrade(name);
    },
    {passive: true}
  );
}
