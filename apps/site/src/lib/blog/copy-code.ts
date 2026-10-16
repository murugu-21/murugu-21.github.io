import { COPY_LABEL } from "./shiki-copy-button";

const COPIED_MS = 2000;

export function installCopyCode(root: Element): void {
  const resets = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  // Screen readers don't reliably announce an aria-label change. The region sits outside
  // the post body so read-aloud doesn't speak it.
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.className = "sr-only";
  document.body.append(status);

  const copy = async (button: Element) => {
    const code = button.closest("[data-code-block]")?.querySelector("pre code");
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.textContent);
    } catch {
      // Denied permission or an insecure context: the button stays as it was.
      return;
    }
    button.setAttribute("data-copied", "");
    button.setAttribute("aria-label", "Copied");
    status.textContent = "Copied";
    clearTimeout(resets.get(button));
    resets.set(
      button,
      setTimeout(() => {
        button.removeAttribute("data-copied");
        button.setAttribute("aria-label", COPY_LABEL);
        status.textContent = "";
      }, COPIED_MS)
    );
  };

  root.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-copy-code]");
    if (button) void copy(button);
  });
}
