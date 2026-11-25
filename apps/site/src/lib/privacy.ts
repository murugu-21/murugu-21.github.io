export const PRIVACY_PATH = "/privacy/";

const CONSENT_UPDATED = "2026-11-25";

export const CONSENT_REVISION = Number(CONSENT_UPDATED.replaceAll("-", ""));

export const NOTICE_UPDATED = "2026-11-25";

export const CONSENT_COOKIE = { name: "cc_cookie", days: 182 } as const;

export const REPLAY_RETENTION_DAYS = 30;

export const analyticsProvider = {
  name: "PostHog",
  company: "PostHog, Inc.",
  location: "United States",
  privacyPolicy: "https://posthog.com/privacy"
} as const;

interface StoredItem {
  key: string;
  where: "Cookie" | "Local storage" | "Session storage" | "Cookie, local and session storage";
  purpose: string;
  lifetime: string;
  setBy: "site" | "consent banner" | typeof analyticsProvider.name;
  needsConsent: boolean;
}

export const storedData = [
  {
    key: CONSENT_COOKIE.name,
    where: "Cookie",
    purpose: "Remembers your cookie choice.",
    lifetime: `${CONSENT_COOKIE.days} days`,
    setBy: "consent banner",
    needsConsent: false
  },
  {
    key: "isDark",
    where: "Local storage",
    purpose: "Remembers the light or dark theme you picked.",
    lifetime: "Until you clear it",
    setBy: "site",
    needsConsent: false
  },
  {
    key: "chatRoomId",
    where: "Local storage",
    purpose: "Lets the chat pick up your conversation where you left it.",
    lifetime: "Until you clear it",
    setBy: "site",
    needsConsent: false
  },
  {
    key: "chatTooltipSeen",
    where: "Local storage",
    purpose: "Hides the chat hint once you've seen it.",
    lifetime: "Until you clear it",
    setBy: "site",
    needsConsent: false
  },
  {
    key: "listenRate",
    where: "Local storage",
    purpose: "Remembers the read-aloud speed.",
    lifetime: "Until you clear it",
    setBy: "site",
    needsConsent: false
  },
  {
    key: "__ph_opt_in_out_<project key>",
    where: "Local storage",
    purpose: `Tells ${analyticsProvider.name} which choice you made.`,
    lifetime: "Until you clear it",
    setBy: analyticsProvider.name,
    needsConsent: false
  },
  {
    key: "ph_<project key>_posthog",
    where: "Cookie, local and session storage",
    purpose: "An anonymous ID for you and your current visit.",
    lifetime: "365 days",
    setBy: analyticsProvider.name,
    needsConsent: true
  },
  {
    key: "ph_<project key>_window_id",
    where: "Session storage",
    purpose: "Tells your browser tabs apart within a visit.",
    lifetime: "Until you close the tab",
    setBy: analyticsProvider.name,
    needsConsent: true
  },
  {
    key: "ph_<project key>_session_registered_properties",
    where: "Session storage",
    purpose: "Keeps details of the current visit, such as the page you arrived from.",
    lifetime: "Until you close the tab",
    setBy: analyticsProvider.name,
    needsConsent: true
  }
] as const satisfies readonly StoredItem[];

export type SiteStorageKey = Extract<(typeof storedData)[number], { setBy: "site" }>["key"];

export const formatDate = (isoDate: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );

const hasAnalyticsServices = (value: unknown): value is { services: { analytics: string[] } } =>
  typeof value === "object" &&
  value !== null &&
  "services" in value &&
  typeof value.services === "object" &&
  value.services !== null &&
  "analytics" in value.services &&
  Array.isArray(value.services.analytics);

export function consentStatus(cookies: string): string {
  const prefix = `${CONSENT_COOKIE.name}=`;
  const raw = cookies
    .split("; ")
    .find(cookie => cookie.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return "You haven't chosen yet.";
  let stored: unknown;
  try {
    stored = JSON.parse(decodeURIComponent(raw));
  } catch {
    return "You haven't chosen yet.";
  }
  if (!hasAnalyticsServices(stored)) return "You haven't chosen yet.";
  const services = stored.services.analytics;
  if (!services.includes("statistics"))
    return "Right now you've rejected analytics, so visits are only counted anonymously.";
  return services.includes("replay")
    ? "Right now you allow analytics and recordings."
    : "Right now you allow analytics, without recordings.";
}
