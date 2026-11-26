export const MIN_VERSIONS = {
  chrome: "123",
  edge: "123",
  firefox: "128",
  safari: "17.5",
  ios: "17.5"
} as const;

export const BROWSER_TARGETS = Object.entries(MIN_VERSIONS).map(
  ([browser, version]) => `${browser}${version}`
);
