import { startTransition, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import interaction from "#src/directives/interaction.ts";

export function interactionIsland({ ui, island }: { ui: ReactElement; island: HTMLElement }) {
  island.innerHTML = renderToString(ui);
  const bundle = Promise.withResolvers<void>();
  let root: Root | null = null;
  interaction(
    async () => {
      await bundle.promise;
      return async () => {
        startTransition(() => {
          root = hydrateRoot(island, ui);
        });
      };
    },
    { name: "interaction", value: "" },
    island
  );
  return {
    loadBundle: () => bundle.resolve(),
    unmount: () => root?.unmount()
  };
}
