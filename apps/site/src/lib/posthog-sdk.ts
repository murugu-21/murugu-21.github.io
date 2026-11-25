import type { CaptureResult, PostHogConfig } from "posthog-js/dist/module.slim";
import {
  AnalyticsExtensions,
  ErrorTrackingExtensions,
  SessionReplayExtensions,
  ToolbarExtensions
} from "posthog-js/dist/extension-bundles";

import type { ConsentChoice, PostHog } from "./analytics";
import { onFirstInteraction } from "./first-interaction";
import { REPLAY_MASK_ATTRIBUTE } from "./replay-mask";

export { default as posthog } from "posthog-js/dist/module.slim";

const extensions = {
  autocapture: AnalyticsExtensions.autocapture,
  historyAutocapture: AnalyticsExtensions.historyAutocapture,
  heatmaps: AnalyticsExtensions.heatmaps,
  webVitalsAutocapture: AnalyticsExtensions.webVitalsAutocapture,
  ...ErrorTrackingExtensions,
  ...SessionReplayExtensions,
  ...ToolbarExtensions
};

// PII: the blog's search text and tag filter. PostHog masks them in page URLs but not in
// referrers, which carry them after a same-site click from a filtered /blog/ list.
const MASKED_PARAMS = ["q", "tag"];
const REFERRERS = ["$referrer", "$session_entry_referrer", "$initial_referrer"];
const MASKED_IN_QUERY = new RegExp(`([?&](?:${MASKED_PARAMS.join("|")})=)[^&#]*`, "g");

const isString = (value: unknown): value is string => typeof value === "string";

export function maskReferrers(event: CaptureResult | null): CaptureResult | null {
  for (const props of [event?.properties, event?.$set_once]) {
    if (!props) continue;
    for (const key of REFERRERS) {
      const value: unknown = props[key];
      if (isString(value)) props[key] = value.replaceAll(MASKED_IN_QUERY, "$1<masked>");
    }
  }
  return event;
}

export const postHogConfig = (host: string): Partial<PostHogConfig> => ({
  __extensionClasses: extensions,
  api_host: host.replace(/\/$/, ""),
  // the toolbar needs PostHog's real domain, not the proxy
  ui_host: "https://us.posthog.com",
  cookieless_mode: "on_reject",
  disable_session_recording: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: `[${REPLAY_MASK_ATTRIBUTE}]`
  },
  capture_exceptions: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: MASKED_PARAMS,
  before_send: maskReferrers
});

const startReplayOnNextInput = (ph: PostHog): void => {
  const win: EventTarget | undefined = globalThis.window;
  if (win) onFirstInteraction(() => ph.startSessionRecording(), win);
};

export function applyConsent(ph: PostHog, choice: ConsentChoice): void {
  const stored = ph.get_explicit_consent_status();
  if (!choice.analytics) {
    if (stored !== "denied") ph.opt_out_capturing();
  } else if (choice.justChosen || stored !== "granted") {
    ph.opt_in_capturing({
      captureProperties: { consent_id: choice.consentId, consent_revision: String(choice.revision) }
    });
  }
  if (!choice.replay) {
    if (choice.justChosen) ph.stopSessionRecording();
    return;
  }
  if (choice.justChosen) {
    ph.startSessionRecording();
    return;
  }
  startReplayOnNextInput(ph);
}
