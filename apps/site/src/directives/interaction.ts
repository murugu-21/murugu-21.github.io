import type { ClientDirective } from "astro";

import { onFirstInteraction } from "#src/lib/first-interaction.ts";

const interaction: ClientDirective = (load, _options, el) => {
  let firstTap: Element | null = null;
  const rememberFirstTap = (event: Event) => {
    if (event.target instanceof Element) firstTap ??= event.target;
  };
  el.addEventListener("click", rememberFirstTap);

  onFirstInteraction(() => {
    void (async () => {
      const hydrate = await load();
      await hydrate();
      el.removeEventListener("click", rememberFirstTap);
      firstTap?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    })();
  });
};

export default interaction;
