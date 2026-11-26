import type { PostHogConfig } from "posthog-js/dist/module.slim";

import type { PostSlug } from "@murugappan/contracts/api/slug.ts";
import type { ConsentControls } from "./consent";
import { onFirstInteraction } from "./first-interaction";
import type { Theme } from "./theme";

export type ScriptEvents = {
  chat_error: null;
  chat_limit: null;
  chat_message_sent: null;
  chat_open: null;
  chat_restart: null;
  chat_starter_click: null;
  chat_transcript_download: null;
  listen_audio_fallback: null;
  listen_complete: null;
  listen_pause: null;
  listen_play: { post?: PostSlug };
  listen_rate: { listen_rate: `${number}x` };
  listen_resume: null;
  listen_seek: null;
  listen_unavailable: null;
};

type TrackArgs = {
  [E in keyof ScriptEvents]: ScriptEvents[E] extends null
    ? [event: E]
    : [event: E, props: ScriptEvents[E]];
}[keyof ScriptEvents];

export type SuperProperties = {
  theme: Theme;
  listen_backend: "audio" | "speech";
};

export type ErrorContext = { surface: "chat" };

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

let pending: Array<(ph: PostHog) => void> | null = [];

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

const clean = (props?: Partial<Record<string, string>>): Record<string, string> | undefined => {
  const kept = Object.entries(props ?? {}).flatMap(([key, value]) =>
    value?.trim() ? [[key, value] as const] : []
  );
  return kept.length ? Object.fromEntries(kept) : undefined;
};

export function tag(props: Partial<SuperProperties>): void {
  const cleaned = clean(props);
  if (!cleaned) return;
  send(ph => ph.register(cleaned));
}

const capture = (event: string, props?: Partial<Record<string, string>>): void => {
  const cleaned = clean(props);
  send(ph => ph.capture(event, cleaned));
};

export function track(...[event, props]: TrackArgs): void {
  capture(event, props);
}

export function reportError(cause: unknown, context?: ErrorContext): void {
  const cleaned = clean(context);
  send(ph => ph.captureException(cause, cleaned));
}

let clickTrackingStarted = false;

export function initClickTracking(): void {
  if (clickTrackingStarted) return;
  clickTrackingStarted = true;
  document.addEventListener(
    "click",
    event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest<HTMLElement>("[data-ph-event]");
      const name = el?.dataset.phEvent;
      if (!el || !name) return;
      const { phProp, phValue } = el.dataset;
      capture(name, phProp && phValue ? { [phProp]: phValue } : undefined);
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
  if (!token || !host) {
    discardUnconsented();
    return Promise.resolve();
  }
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
