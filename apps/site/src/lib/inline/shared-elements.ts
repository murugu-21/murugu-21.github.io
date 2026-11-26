import { inlineScript } from "./inline-script";

interface SharedElementHost extends Pick<Window, "addEventListener" | "innerHeight"> {
  document: Pick<Document, "querySelectorAll">;
  navigation?: { activation: { from: { url: string | null } | null } | null };
}

// An element off screen would fly in from wherever it is, such as a post's h1 after reading to the
// bottom, so it drops its name. A name repeated on a page cancels the transition, so of the list's
// titles only the one linking to the post being opened or left takes post-title.
export function pairSharedElements(win: SharedElementHost): void {
  const onScreen = (element: Element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return bottom > 0 && top < win.innerHeight;
  };
  const mark = (url: string | null | undefined, transition: ViewTransition | null) => {
    if (!transition) return;
    for (const element of win.document.querySelectorAll("[data-shared]")) {
      element.toggleAttribute("data-offscreen", !onScreen(element));
    }
    const pathname = url ? new URL(url).pathname : null;
    for (const title of win.document.querySelectorAll("[data-post-href]")) {
      const match = title.getAttribute("data-post-href") === pathname && onScreen(title);
      title.toggleAttribute("data-morph", match);
      if (match) void transition.finished.then(() => title.removeAttribute("data-morph"));
    }
  };
  win.addEventListener("pageswap", event =>
    mark(event.activation?.entry.url, event.viewTransition)
  );
  win.addEventListener("pagereveal", event =>
    mark(win.navigation?.activation?.from?.url, event.viewTransition)
  );
}

export const sharedElementScript = inlineScript({
  run: pairSharedElements,
  args: [],
  syntax: "latest"
});
