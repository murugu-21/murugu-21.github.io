import { useSyncExternalStore } from "react";

// The theme is owned by the blocking script in ../layouts/BaseLayout.astro,
// which runs before first paint and re-fires `themechange` on every switch.
// That makes it an external store rather than React state, so read it with
// useSyncExternalStore: no setState-in-effect, and the listener is actually
// torn down on unmount.

type Theme = "light" | "dark";

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("themechange", onStoreChange);
  return () => window.removeEventListener("themechange", onStoreChange);
};

// A string, so React's identity check settles immediately.
const getSnapshot = (): Theme | null => window.__theme ?? null;

// window.__theme only exists once the browser has run the bootstrap script, so
// the server — and therefore the hydration pass, which React renders from this
// same snapshot — sees "theme not known yet". React re-renders with the real
// value right after hydration, so callers must handle null.
const getServerSnapshot = (): Theme | null => null;

export function useTheme(): Theme | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
