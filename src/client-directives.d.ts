// Custom client directives registered in astro.config.ts. Astro only knows
// its built-in `client:*` attributes; declaring ours here lets `astro check`
// and the editor accept them on a component.
import "astro";

declare module "astro" {
  interface AstroClientDirectives {
    /** Hydrate on the visitor's first input — see src/directives/interaction.ts. */
    "client:interaction"?: boolean;
  }
}
