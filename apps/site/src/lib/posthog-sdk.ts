import {
  AnalyticsExtensions,
  ErrorTrackingExtensions,
  SessionReplayExtensions,
  ToolbarExtensions
} from "posthog-js/dist/extension-bundles";

export { default as posthog } from "posthog-js/dist/module.slim";

export const extensions = {
  autocapture: AnalyticsExtensions.autocapture,
  historyAutocapture: AnalyticsExtensions.historyAutocapture,
  heatmaps: AnalyticsExtensions.heatmaps,
  webVitalsAutocapture: AnalyticsExtensions.webVitalsAutocapture,
  ...ErrorTrackingExtensions,
  ...SessionReplayExtensions,
  ...ToolbarExtensions
};
