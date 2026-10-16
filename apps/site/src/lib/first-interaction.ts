// Not `scroll`: Chrome fires a trusted scroll event during load with no input.
const EVENTS = ["pointerdown", "pointermove", "touchstart", "keydown", "wheel"] as const;

export function onFirstInteraction(cb: () => void, target: EventTarget = window): () => void {
  const listening = new AbortController();
  const fire = () => {
    listening.abort();
    cb();
  };
  for (const type of EVENTS) target.addEventListener(type, fire, { signal: listening.signal });
  return () => listening.abort();
}
