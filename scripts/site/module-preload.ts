import path from "node:path";

// Astro emits no modulepreload hints for the small chunks module scripts
// import, costing a dependent round trip. Hint static imports transitively;
// dynamic import() targets are interaction-gated and deliberately left out.
const STATIC_IMPORT = /\b(?:from|import)\s*"(\.\/[^"]+\.js)"/g;
const MODULE_SCRIPT = /<script type="module" src="(\/[^"]+\.js)"/g;
const FIRST_MODULE_SCRIPT = '<script type="module" src="';

// Every module the entries reach through static imports, minus the entries themselves.
function transitiveImports(entries: string[], importsOf: (href: string) => string[]) {
  const deps = new Set<string>();
  const walk = (href: string) => {
    for (const dep of importsOf(href)) {
      if (deps.has(dep) || entries.includes(dep)) continue;
      deps.add(dep);
      walk(dep);
    }
  };
  entries.forEach(walk);
  return deps;
}

// `readModule` returns a built module's source by its root-relative href, or
// undefined when there's no such file. The returned function gives a page's
// HTML with the hints added, or undefined when it has nothing to hint.
export function modulePreloader(readModule: (href: string) => string | undefined) {
  const imports = new Map<string, string[]>();
  const importsOf = (href: string) => {
    const found =
      imports.get(href) ??
      Array.from(readModule(href)?.matchAll(STATIC_IMPORT) ?? [], m =>
        path.posix.join(path.posix.dirname(href), m[1])
      );
    imports.set(href, found);
    return found;
  };
  return (html: string): string | undefined => {
    const entries = Array.from(html.matchAll(MODULE_SCRIPT), m => m[1]);
    const deps = transitiveImports(entries, importsOf);
    if (!deps.size) return undefined;
    const links = Array.from(deps, d => `<link rel="modulepreload" href="${d}">`).join("");
    // before the first module script, so the preload scanner sees them together
    const at = html.indexOf(FIRST_MODULE_SCRIPT);
    return html.slice(0, at) + links + html.slice(at);
  };
}
