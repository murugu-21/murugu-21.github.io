import type { ClientDirective } from "astro";

import { onFirstInteraction } from "#src/lib/first-interaction.ts";

const interaction: ClientDirective = (load, _options, el) => {
  const rememberClick = () => {
    el.dataset.openOnHydrate = "true";
  };
  el.addEventListener("click", rememberClick);
  const hydrateNow = async () => {
    const hydrate = await load();
    await hydrate();
    el.removeEventListener("click", rememberClick);
  };
  onFirstInteraction(() => void hydrateNow());
};

export default interaction;
