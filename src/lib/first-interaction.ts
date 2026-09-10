// One-shot "the visitor is really here" signal, shared by the chat island's
// client:interaction directive (../directives/interaction.ts) and PostHog's
// session-replay start (./analytics.ts).
//
// Fires once, on the first pointer, touch, key or wheel event anywhere on the
// page, then removes its listeners. It never fires for a visitor that only
// loads the page — which is exactly what a Lighthouse run does — so work gated
// on it stays out of the measured window while still reaching every real
// visitor who so much as moves the cursor.
//
// Not `scroll`: Chrome dispatches a trusted scroll event during load with no
// user input (seen at ~70 ms after navigation), which fired this on every
// page view. Real scrolling always arrives through one of the inputs below —
// wheel or keyboard on desktop, touch on phones — so nothing is lost.
const EVENTS = ["pointerdown", "pointermove", "touchstart", "keydown", "wheel"] as const;

/**
 * Call `cb` on the first user input on `target` (the window by default).
 * Returns a cancel function; after cancelling, `cb` never runs.
 */
export function onFirstInteraction(cb: () => void, target: EventTarget = window): () => void {
  let done = false;
  const off = () => {
    for (const type of EVENTS) target.removeEventListener(type, fire);
  };
  const fire = () => {
    if (done) return;
    done = true;
    off();
    cb();
  };
  // Bubbling listeners are enough: all of these reach the window. No options:
  // nothing here calls preventDefault, and browsers already treat
  // window-level wheel and touch listeners as passive.
  for (const type of EVENTS) target.addEventListener(type, fire);
  return () => {
    done = true;
    off();
  };
}
