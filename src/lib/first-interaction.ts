// One-shot first-input signal for the chat island's client:interaction
// directive and PostHog's session replay. Never fires on a bare page load, so
// gated work stays out of Lighthouse runs.
// Not `scroll`: Chrome fires a trusted scroll event during load with no input.
const EVENTS = ["pointerdown", "pointermove", "touchstart", "keydown", "wheel"] as const;

/** Returns a cancel function; after cancelling, `cb` never runs. */
export function onFirstInteraction(cb: () => void, target: EventTarget = window): () => void {
  const listening = new AbortController();
  const fire = () => {
    listening.abort();
    cb();
  };
  // Only a signal: nothing calls preventDefault, and window-level wheel/touch
  // listeners are passive by default.
  for (const type of EVENTS) target.addEventListener(type, fire, { signal: listening.signal });
  return () => listening.abort();
}
