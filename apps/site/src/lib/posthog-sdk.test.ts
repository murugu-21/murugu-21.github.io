import { expect, it } from "vite-plus/test";

import { extensions } from "./posthog-sdk";

it("loads autocapture, heatmaps, error tracking, replay and the toolbar into the slim SDK", () => {
  expect(Object.keys(extensions).sort()).toEqual([
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
