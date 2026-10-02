import { useSyncExternalStore } from "react";

import type { Theme } from "../../lib/theme";

// The theme is owned by the pre-paint script in ../layouts/BaseLayout.astro,
// which fires `themechange` on every switch, so it is an external store.

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("themechange", onStoreChange);
  return () => window.removeEventListener("themechange", onStoreChange);
};

// A string, so React's identity check settles immediately.
const getSnapshot = (): Theme | null => window.__theme ?? null;

// The server and the hydration pass can't see window.__theme; React re-renders
// with the real value after hydration, so callers must handle null.
const getServerSnapshot = (): Theme | null => null;

export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
