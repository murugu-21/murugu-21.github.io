import { useSyncExternalStore } from "react"

// The theme is owned by the blocking script in ../layouts/BaseLayout.astro,
// which runs before first paint and re-fires `themechange` on every switch.
// That makes it an external store rather than React state, so read it with
// useSyncExternalStore: no setState-in-effect, and the listener is actually
// torn down on unmount.

const subscribe = onStoreChange => {
  window.addEventListener("themechange", onStoreChange)
  return () => window.removeEventListener("themechange", onStoreChange)
}

// A string, so React's identity check settles immediately.
const getSnapshot = () => window.__theme

// window.__theme only exists once the browser has run the bootstrap script, so
// the server — and therefore the hydration pass, which React renders from this
// same snapshot — sees "theme not known yet". React re-renders with the real
// value right after hydration, so callers must handle null.
const getServerSnapshot = () => null

export function useTheme() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
