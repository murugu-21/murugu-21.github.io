import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";

import { Toaster } from "#src/components/ui/sonner.tsx";

const VISIBLE_MS = 8000;

const markSaved = (on: boolean) =>
  document.documentElement.toggleAttribute("data-consent-saved", on);

let root: Root | undefined;

export function showSaved(host: Element, message: string): void {
  if (!root) {
    root = createRoot(host);
    root.render(<Toaster position="bottom-left" closeButton />);
  }
  markSaved(true);
  toast(message, {
    id: "consent-saved",
    duration: VISIBLE_MS,
    onDismiss: () => markSaved(false),
    onAutoClose: () => markSaved(false)
  });
}
