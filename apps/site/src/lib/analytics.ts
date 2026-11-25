// PII: never pass anything a visitor typed (chat messages, search queries).

import type { PostHogConfig } from "posthog-js/dist/module.slim";

import type { ConsentControls } from "./consent";
import { onFirstInteraction } from "./first-interaction";

export interface PostHog {
  capture(event: string, properties?: Record<string, string>): void;
  captureException(cause: unknown, properties?: Record<string, string>): void;
  register(properties: Record<string, string>): void;
  init(token: string, config: Partial<PostHogConfig>): void;
  startSessionRecording(): void;
  stopSessionRecording(): void;
  opt_in_capturing(options: { captureProperties: Record<string, string> }): void;
  opt_out_capturing(): void;
  get_explicit_consent_status(): "granted" | "denied" | "pending";
}

export interface ConsentChoice {
  analytics: boolean;
  replay: boolean;
  consentId: string;
  revision: number;
  justChosen: boolean;
}

type ConsentRunner = (onChoice: (choice: ConsentChoice) => void) => Promise<ConsentControls>;

const runConsent: ConsentRunner = onChoice => import("./consent").then(m => m.runConsent(onChoice));

declare global {
  var posthog: unknown;
}

const isPostHog = (p: unknown): p is PostHog =>
  typeof p === "object" &&
  p !== null &&
  "capture" in p &&
  typeof p.capture === "function" &&
  "register" in p &&
  typeof p.register === "function";

interface SdkModule {
  posthog: PostHog;
  postHogConfig(host: string): Partial<PostHogConfig>;
  applyConsent(ph: PostHog, choice: ConsentChoice): void;
}

type SdkLoader = () => Promise<SdkModule>;

const loadSdk: SdkLoader = () => import("./posthog-sdk");

let sdk: PostHog | null = null;

let loading: Promise<SdkModule> | null = null;

let consent: Promise<ConsentControls | null> | null = null;

let startConsent: (() => void) | null = null;

let pending: Array<(ph: PostHog) => void> | null = null;

let stopEarlyErrors: (() => void) | null = null;

const stopEarlyErrorCapture = () => {
  stopEarlyErrors?.();
  stopEarlyErrors = null;
};

const discardUnconsented = () => {
  stopEarlyErrorCapture();
  pending = null;
};

const client = (): PostHog | null => {
  if (sdk) return sdk;
  return isPostHog(globalThis.posthog) ? globalThis.posthog : null;
};

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

const clean = (props?: Record<string, string>): Record<string, string> | undefined => {
  const kept = Object.entries(props ?? {}).filter(([, v]) => v.trim());
  return kept.length ? Object.fromEntries(kept) : undefined;
};

export function tag(key: string, value: string): void {
  if (!value.trim()) return;
  send(ph => ph.register({ [key]: value }));
}

export function track(event: string, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.capture(event, cleaned));
}

export function reportError(cause: unknown, props?: Record<string, string>): void {
  const cleaned = clean(props);
  send(ph => ph.captureException(cause, cleaned));
}

const TRACKED = new WeakSet<object>();

// Not `instanceof Element`: the Node test project has no DOM globals.
const isElement = (target: EventTarget | null): target is Element =>
  target !== null && "closest" in target && typeof target.closest === "function";

export function initClickTracking(root?: Document): void {
  // lib.dom types this as always defined; it is undefined outside a browser
  const doc: Document | undefined = root ?? globalThis.document;
  if (!doc || TRACKED.has(doc)) return;
  TRACKED.add(doc);
  doc.addEventListener(
    "click",
    event => {
      const target = event.target;
      if (!isElement(target)) return;
      const el = target.closest<HTMLElement>("[data-ph-event]");
      const name = el?.dataset.phEvent;
      if (!el || !name) return;
      const { phProp, phValue } = el.dataset;
      track(name, phProp && phValue ? { [phProp]: phValue } : undefined);
    },
    { passive: true }
  );
}

export async function initAnalytics({
  token,
  host,
  choice,
  load = loadSdk
}: {
  token: string | undefined;
  host: string | undefined;
  choice: ConsentChoice;
  load?: SdkLoader;
}): Promise<void> {
  if (!token?.trim() || !host?.trim()) return;
  pending ??= [];
  loading ??= load().then(sdkModule => {
    sdkModule.posthog.init(token.trim(), sdkModule.postHogConfig(host.trim()));
    return sdkModule;
  });
  let loaded: SdkModule;
  try {
    loaded = await loading;
  } catch {
    loading = null;
    discardUnconsented();
    return;
  }
  const ph = loaded.posthog;
  loaded.applyConsent(ph, choice);
  if (sdk) return;
  sdk = ph;
  stopEarlyErrorCapture();
  const queued = pending;
  pending = null;
  for (const fn of queued) {
    try {
      fn(ph);
    } catch {}
  }
}

// Long enough to land outside Lighthouse's trace, short enough to count readers who never
// interact.
const SDK_LOAD_FALLBACK_MS = 10_000;

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

async function askForConsent({
  token,
  host,
  load,
  ask
}: {
  token: string;
  host: string;
  load: SdkLoader;
  ask: ConsentRunner;
}): Promise<void> {
  let firstChoice: Promise<void> | undefined;
  consent ??= ask(choice => {
    const applied = initAnalytics({ token, host, choice, load });
    firstChoice ??= applied;
  }).catch(() => {
    discardUnconsented();
    return null;
  });
  await consent;
  await firstChoice;
}

export function openConsentSettings(): void {
  startConsent?.();
  void consent?.then(controls => controls?.showSettings());
}

export function bootAnalytics({
  root,
  load = loadSdk,
  ask = runConsent
}: { root?: Document; load?: SdkLoader; ask?: ConsentRunner } = {}): Promise<void> {
  const doc: Document | undefined = root ?? globalThis.document;
  if (!doc) return Promise.resolve();
  const meta = (name: string) =>
    doc.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.getAttribute("content") ??
    undefined;
  const token = meta("ph-token");
  const host = meta("ph-host");
  if (!token || !host) return Promise.resolve();
  const win = doc.defaultView;
  if (win && !stopEarlyErrors) {
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
  return new Promise(resolve => {
    startConsent = () => resolve(askForConsent({ token, host, load, ask }));
    scheduleSdkLoad(() => startConsent?.(), win ?? window);
  });
}
