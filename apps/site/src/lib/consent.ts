import * as CookieConsent from "vanilla-cookieconsent";
// ?inline keeps the stylesheet in this lazy chunk; a plain import lands in every page's CSS.
import vendorStyles from "vanilla-cookieconsent/dist/cookieconsent.css?inline";

import type { ConsentChoice } from "./analytics";
import {
  analyticsProvider,
  CONSENT_COOKIE,
  CONSENT_REVISION,
  PRIVACY_PATH,
  REPLAY_RETENTION_DAYS
} from "./privacy";

const privacyLink = `<a href="${PRIVACY_PATH}">Privacy and cookies</a>`;

export const toChoice = ({
  statistics,
  replay,
  consentId,
  justChosen
}: {
  statistics: boolean;
  replay: boolean;
  consentId: string;
  justChosen: boolean;
}): ConsentChoice => ({
  analytics: statistics,
  replay: statistics && replay,
  consentId,
  revision: CONSENT_REVISION,
  justChosen
});

const choice = (justChosen: boolean): ConsentChoice =>
  toChoice({
    statistics: CookieConsent.acceptedService("statistics", "analytics"),
    replay: CookieConsent.acceptedService("replay", "analytics"),
    consentId: CookieConsent.getCookie("consentId"),
    justChosen
  });

export function linkReplayToCounts(modal: ParentNode): void {
  const toggle = (service: string) =>
    modal.querySelector<HTMLInputElement>(`input[value="${service}"]`);
  const counts = toggle("statistics");
  const replay = toggle("replay");
  if (!counts || !replay) return;
  const set = (input: HTMLInputElement, checked: boolean) => {
    if (input.checked === checked) return;
    input.checked = checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  replay.addEventListener("change", () => {
    if (replay.checked) set(counts, true);
  });
  counts.addEventListener("change", () => {
    if (!counts.checked) set(replay, false);
  });
}

export const savedMessage = ({ analytics, replay }: ConsentChoice): string => {
  const state = !analytics
    ? "analytics off. Visits are still counted anonymously"
    : replay
      ? "analytics and recordings on"
      : "analytics on, recordings off";
  return `Saved: ${state}. Change it any time from Cookie settings at the bottom of every page.`;
};

const bracketTitle = (modal: ParentNode): void => {
  const title = modal.querySelector(".cm__title, .pm__title");
  if (!title) return;
  const bracket = (text: string) => {
    const span = document.createElement("span");
    span.className = "text-subtitle-muted";
    span.setAttribute("aria-hidden", "true");
    span.textContent = text;
    return span;
  };
  title.prepend(bracket("<\u00a0"));
  title.append(bracket("\u00a0/>"));
};

const openAnalytics = (modal: ParentNode): void => {
  const section = modal.querySelector('input[value="analytics"]')?.closest(".pm__section--toggle");
  section?.querySelector<HTMLButtonElement>("button.pm__section-title")?.click();
};

export interface ConsentControls {
  showSettings(): void;
}

export async function runConsent(
  onChoice: (choice: ConsentChoice) => void
): Promise<ConsentControls> {
  const uiIsland = document.createElement("div");
  uiIsland.className = "ui-island";
  const styles = document.createElement("style");
  styles.textContent = `@layer cookie-consent.vendor {${vendorStyles}}`;
  document.head.append(styles);

  const toastHost = document.createElement("div");
  uiIsland.append(toastHost);
  document.body.append(uiIsland);

  const announce = (made: ConsentChoice) =>
    void import("./consent-toast").then(({ showSaved }) =>
      showSaved(toastHost, savedMessage(made))
    );

  // The banner only overlays the page, so Tab may leave it; the library would keep it inside.
  uiIsland.addEventListener(
    "keydown",
    event => {
      if (event.key !== "Tab" || !(event.target instanceof Element)) return;
      if (event.target.closest(".cm")) event.stopPropagation();
    },
    { capture: true }
  );

  let returnFocus = document.activeElement;
  const restoreFocus = () =>
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      const target =
        returnFocus instanceof HTMLElement && returnFocus !== document.body
          ? returnFocus
          : document.querySelector("main");
      if (!target) return;
      if (target.tabIndex < 0 && !target.hasAttribute("tabindex"))
        target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });

  // On a first choice the library fires onFirstConsent and then onConsent.
  let justChose = false;
  await CookieConsent.run({
    root: uiIsland,
    revision: CONSENT_REVISION,
    respectGpc: true,
    cookie: { name: CONSENT_COOKIE.name, expiresAfterDays: CONSENT_COOKIE.days },
    guiOptions: {
      consentModal: { layout: "box inline", position: "bottom left", equalWeightButtons: true },
      preferencesModal: { layout: "box", equalWeightButtons: true }
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
      analytics: {
        services: {
          statistics: { label: "Visit counts, clicks and heatmaps" },
          replay: { label: "Recordings of clicks and scrolling (needs visit counts)" }
        },
        autoClear: { cookies: [{ name: /^ph_/ }] }
      }
    },
    onFirstConsent: () => {
      justChose = true;
      const made = choice(true);
      onChoice(made);
      announce(made);
    },
    onConsent: () => {
      if (justChose) {
        justChose = false;
        return;
      }
      onChoice(choice(false));
    },
    onChange: () => {
      const made = choice(true);
      onChoice(made);
      announce(made);
    },
    onModalShow: () => {
      const active = document.activeElement;
      if (active && !uiIsland.contains(active)) returnFocus = active;
    },
    onModalHide: restoreFocus,
    onModalReady: ({ modalName, modal }) => {
      if (modalName === "preferencesModal") {
        linkReplayToCounts(modal);
        openAnalytics(modal);
      }
      bracketTitle(modal);
    },
    language: {
      default: "en",
      translations: {
        en: {
          consentModal: {
            title: "Analytics cookies",
            description: `Can ${analyticsProvider.name} count visits and record clicks and scrolling (never typing) so I can fix confusing pages? If you reject, visits are still counted anonymously.{{revisionMessage}}`,
            revisionMessage: "<br><br>What I ask for has changed since you last chose.",
            acceptAllBtn: "Accept",
            acceptNecessaryBtn: "Reject",
            showPreferencesBtn: "Cookie settings",
            footer: privacyLink
          },
          preferencesModal: {
            title: "Cookie settings",
            acceptAllBtn: "Accept",
            acceptNecessaryBtn: "Reject",
            savePreferencesBtn: "Save choices",
            closeIconLabel: "Close",
            sections: [
              {
                description: `Choose what I can collect. Change it any time from Cookie settings at the bottom of every page. Error reports are sent either way once you've chosen, so I can fix them, without cookies if you rejected. ${privacyLink}`
              },
              {
                title: "Needed for the site",
                description:
                  "Remembers this choice, your theme, your chat and the read-aloud speed. Always on.",
                linkedCategory: "necessary"
              },
              {
                title: "Analytics",
                description: `Visit counts, clicks and heatmaps, plus recordings of how you moved through the page, with typed text and chat messages masked. Recordings are kept ${REPLAY_RETENTION_DAYS} days. With this off, visits are still counted anonymously, without cookies.`,
                linkedCategory: "analytics"
              }
            ]
          }
        }
      }
    }
  });
  return { showSettings: () => CookieConsent.showPreferences() };
}
