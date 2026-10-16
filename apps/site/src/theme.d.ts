import type { Theme } from "./lib/theme";

declare global {
  interface Window {
    __setPreferredTheme: (theme: Theme) => void;
  }
}

export {};
