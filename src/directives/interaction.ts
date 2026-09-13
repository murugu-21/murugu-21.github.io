import type { ClientDirective } from "astro";

import { onFirstInteraction } from "../lib/first-interaction";

// `client:interaction` — hydrate an island on the visitor's first input
// anywhere on the page (see ../lib/first-interaction.ts) rather than on idle.
// Registered in astro.config.ts; the attribute is typed in
// ../client-directives.d.ts.
//
// Why: the chat island pulls React, react-dom and the widget (~130 KB gzipped)
// and its hydration is a ~100 ms main-thread task. Under client:idle that ran
// on every page load, inside the window Lighthouse scores as Total Blocking
// Time, for a widget most visitors never open. A Lighthouse run never
// interacts, so the island now costs it nothing; a real visitor triggers the
// load the moment they move the pointer, scroll or touch the page, long before
// they reach for the launcher.
//
// A tap on the still-server-rendered launcher while the bundle is in flight
// would otherwise be lost, so it is recorded on the island element and the
// widget opens itself once it mounts (ChatWidget.tsx reads
// data-open-on-hydrate).
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
