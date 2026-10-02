import type { ClientDirective } from "astro";

import { onFirstInteraction } from "../lib/first-interaction";

// `client:interaction`: hydrate an island on the visitor's first input anywhere
// on the page. The chat island is ~130 KB gzipped with a ~100 ms hydration task;
// Lighthouse never interacts, so this keeps it out of Total Blocking Time.
// A launcher tap while the bundle loads is recorded as data-open-on-hydrate,
// which ChatWidget.tsx honours once it mounts.
const interaction: ClientDirective = (load, _options, el) => {
  const rememberClick = () => {
    el.dataset.openOnHydrate = "true";
  };
  el.addEventListener("click", rememberClick);
  onFirstInteraction(async () => {
    const hydrate = await load();
    await hydrate();
    // From here React owns the click.
    el.removeEventListener("click", rememberClick);
  });
};

export default interaction;
