let latestReveal: ViewTransition | undefined;

export function revealTheme(toggle: Element, apply: () => void): ViewTransition | undefined {
  if (!("startViewTransition" in document)) {
    apply();
    return undefined;
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return document.startViewTransition(apply);
  }
  const { left, top, width, height } = toggle.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const root = document.documentElement;
  root.toggleAttribute("data-theme-reveal", true);
  const transition = document.startViewTransition(apply);
  latestReveal = transition;
  // A second click makes the browser skip this transition, settling it while the next one runs.
  void transition.finished.finally(() => {
    if (latestReveal === transition) root.removeAttribute("data-theme-reveal");
  });
  transition.ready
    .then(() =>
      root.animate(
        {
          clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
        },
        {
          duration: 700,
          easing: "ease",
          pseudoElement: "::view-transition-new(root)"
        }
      )
    )
    // Rejects when the transition is skipped, such as in a hidden tab. The theme still switched.
    .catch(() => undefined);
  return transition;
}
