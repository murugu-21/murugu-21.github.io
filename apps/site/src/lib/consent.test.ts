import { expect, it } from "vite-plus/test";

import { savedMessage, toChoice } from "./consent";

it("collects nothing for a visitor who keeps replay but turns off visit counts", () => {
  const pick = ({ statistics, replay }: { statistics: boolean; replay: boolean }) => {
    const { analytics, replay: replays } = toChoice({
      statistics,
      replay,
      consentId: "consent-1",
      justChosen: true
    });
    return { analytics, replays };
  };
  expect(pick({ statistics: false, replay: true })).toEqual({ analytics: false, replays: false });
  expect(pick({ statistics: true, replay: false })).toEqual({ analytics: true, replays: false });
  expect(pick({ statistics: true, replay: true })).toEqual({ analytics: true, replays: true });
});

it("tells the visitor what was saved and where to change it", () => {
  const saved = (statistics: boolean, replay: boolean) =>
    savedMessage(toChoice({ statistics, replay, consentId: "consent-1", justChosen: true }));
  expect(saved(true, true)).toBe(
    "Saved: analytics and recordings on. Change it any time from Cookie settings at the bottom of every page."
  );
  expect(saved(true, false)).toBe(
    "Saved: analytics on, recordings off. Change it any time from Cookie settings at the bottom of every page."
  );
  expect(saved(false, false)).toBe(
    "Saved: analytics off. Visits are still counted anonymously. Change it any time from Cookie settings at the bottom of every page."
  );
});
