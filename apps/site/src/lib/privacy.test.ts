import { expect, it } from "vite-plus/test";

import { consentStatus, formatDate } from "./privacy";

it("shows an ISO date the way the privacy notice prints it", () => {
  expect(formatDate("2026-11-25")).toBe("25 November 2026");
});

it("states the visitor's current choice from the consent cookie", () => {
  const cookie = (services: string[]) =>
    `theme=dark; cc_cookie=${encodeURIComponent(JSON.stringify({ services: { necessary: [], analytics: services } }))}`;
  expect(consentStatus(cookie(["statistics", "replay"]))).toBe(
    "Right now you allow analytics and recordings."
  );
  expect(consentStatus(cookie(["statistics"]))).toBe(
    "Right now you allow analytics, without recordings."
  );
  expect(consentStatus(cookie([]))).toBe(
    "Right now you've rejected analytics, so visits are only counted anonymously."
  );
  expect(consentStatus("theme=dark")).toBe("You haven't chosen yet.");
  expect(consentStatus("cc_cookie=%7Bbroken")).toBe("You haven't chosen yet.");
});
