import { expect, it } from "vite-plus/test";

import { postHogConfig } from "./posthog-sdk";

it("loads autocapture, heatmaps, error tracking, replay and the toolbar into the slim SDK", () => {
  const { __extensionClasses } = postHogConfig("https://e.example.dev");
  expect(Object.keys(__extensionClasses ?? {}).sort()).toEqual([
    "autocapture",
    "exceptionObserver",
    "exceptions",
    "heatmaps",
    "historyAutocapture",
    "sessionRecording",
    "toolbar",
    "webVitalsAutocapture"
  ]);
});
