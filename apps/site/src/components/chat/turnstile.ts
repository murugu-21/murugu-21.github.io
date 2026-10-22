/// <reference types="cloudflare-turnstile" />

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// Turnstile calls neither callback when its iframe is blocked.
const TOKEN_TIMEOUT_MS = 15_000;

export const ALWAYS_PASSING_TEST_SITE_KEY = "1x00000000000000000000AA";

declare global {
  interface Window {
    turnstile?: Turnstile.Turnstile;
  }
}

let loading: Promise<Turnstile.Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile.Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<Turnstile.Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    const forgetFailedLoad = () => {
      script.remove();
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    script.addEventListener("load", () =>
      window.turnstile ? resolve(window.turnstile) : forgetFailedLoad()
    );
    script.addEventListener("error", forgetFailedLoad);
    document.head.append(script);
  });
  return loading;
}

type Host = { container: HTMLElement; detached: AbortSignal };

type CheckCallbacks = {
  onInteractiveChange: (interactive: boolean) => void;
  onFocusLost: () => void;
};

type RenderRequest = Host &
  CheckCallbacks & {
    turnstile: Turnstile.Turnstile;
    siteKey: string;
  };

async function renderToken({
  turnstile,
  siteKey,
  container,
  detached,
  onInteractiveChange,
  onFocusLost
}: RenderRequest): Promise<string> {
  let widgetId: ReturnType<Turnstile.Turnstile["render"]>;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled = new AbortController();
  try {
    return await new Promise<string>((resolve, reject) => {
      const startTimeout = () => {
        timeout = setTimeout(() => reject(new Error("Turnstile timed out")), TOKEN_TIMEOUT_MS);
      };
      const waitAsLongAsTheVisitorTakes = () => clearTimeout(timeout);
      detached.throwIfAborted();
      startTimeout();
      detached.addEventListener("abort", () => reject(new Error("The chat panel closed")), {
        signal: settled.signal
      });
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        appearance: "interaction-only",
        callback: resolve,
        "error-callback": code => reject(new Error(`Turnstile failed with ${code}`)),
        "before-interactive-callback": () => {
          waitAsLongAsTheVisitorTakes();
          onInteractiveChange(true);
        },
        "after-interactive-callback": () => {
          onInteractiveChange(false);
          startTimeout();
        }
      });
    });
  } finally {
    clearTimeout(timeout);
    settled.abort();
    onInteractiveChange(false);
    const heldFocus = container.contains(document.activeElement);
    if (widgetId) turnstile.remove(widgetId);
    if (heldFocus) onFocusLost();
  }
}

type ChallengeOptions = CheckCallbacks & { siteKey: string | undefined };

const SESSION_CLOSED = "session closed";

/**
 * Turnstile tokens rendered inside the open chat panel, so an interactive challenge shows where
 * the visitor is looking and stays clickable while the panel is modal. A token request made while
 * the panel is closed waits for it to open, and one cut short by closing it starts over.
 */
export function turnstileChallenge({ siteKey, ...callbacks }: ChallengeOptions) {
  if (!siteKey) return null;
  let host = Promise.withResolvers<Host | typeof SESSION_CLOSED>();
  let closed = false;

  // React passes null only to ref callbacks that return no cleanup.
  const ref = (container: HTMLElement | null) => {
    if (!container) return;
    const controller = new AbortController();
    host.resolve({ container, detached: controller.signal });
    return () => {
      controller.abort();
      host = Promise.withResolvers<Host | typeof SESSION_CLOSED>();
    };
  };

  // A fresh single-use token per call, since the first siteverify spends it.
  const token = async (): Promise<string> => {
    const turnstile = await loadTurnstile();
    for (;;) {
      if (closed) throw new Error("The chat session closed");
      const pendingHost = host;
      const hosted = await pendingHost.promise;
      if (hosted === SESSION_CLOSED) throw new Error("The chat session closed");
      try {
        return await renderToken({ turnstile, siteKey, ...hosted, ...callbacks });
      } catch (err) {
        const panelClosedMidRender = host !== pendingHost;
        if (!panelClosedMidRender) throw err;
      }
    }
  };

  const close = () => {
    closed = true;
    host.resolve(SESSION_CLOSED);
  };

  return { ref, token, close };
}

export type TurnstileChallenge = NonNullable<ReturnType<typeof turnstileChallenge>>;
