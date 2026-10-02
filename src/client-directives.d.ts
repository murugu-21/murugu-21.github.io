// Types the custom client directives registered in astro.config.ts.
import "astro";

declare module "astro" {
  interface AstroClientDirectives {
    /** Hydrate on the visitor's first input (src/directives/interaction.ts). */
    "client:interaction"?: boolean;
  }
}
