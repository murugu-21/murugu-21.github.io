// custom typefaces
import "typeface-montserrat"
import "typeface-merriweather"
// normalize CSS across browsers
import "./src/normalize.css"
// custom CSS styles
import "./src/style.css"

// Highlighting for code blocks
import "prismjs/themes/prism.css"

let mermaidPromise

// Mermaid v11 is pre-bundled by esbuild with --keep-names, so its chunks
// reference an `__name` helper that esbuild would normally inject. When
// Gatsby's webpack re-bundles that ESM the helper is missing, throwing
// "ReferenceError: __name is not defined". Define a no-op shim on the global
// BEFORE mermaid's module code evaluates, then load mermaid via dynamic
// import() so the shim is guaranteed to run first.
function loadMermaid() {
  if (!mermaidPromise) {
    if (typeof window !== "undefined" && typeof window.__name === "undefined") {
      window.__name = (target, name) => {
        try {
          if (typeof target === "function" && name) {
            Object.defineProperty(target, "name", { value: name, configurable: true })
          }
        } catch (e) {
          /* name is non-configurable on some objects — ignore */
        }
        return target
      }
    }

    mermaidPromise = import("mermaid").then(mod => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        securityLevel: "loose",
        fontFamily: "Merriweather, Georgia, serif",
      })
      return mermaid
    })
  }
  return mermaidPromise
}

// Render any ```mermaid code blocks client-side, after each route change.
// gatsby-remark-prismjs leaves the raw diagram source as the block's
// textContent (mermaid isn't a known Prism language), so we read it back out
// and swap the <pre> for the rendered SVG.
export const onRouteUpdate = () => {
  if (typeof window === "undefined") return

  const blocks = document.querySelectorAll("code.language-mermaid")
  if (blocks.length === 0) return

  loadMermaid().then(mermaid => renderBlocks(mermaid, blocks))
}

function renderBlocks(mermaid, blocks) {
  blocks.forEach((block, i) => {
    const pre = block.closest("pre") || block
    if (pre.dataset.mermaidProcessed) return
    pre.dataset.mermaidProcessed = "true"

    const source = block.textContent
    const id = `mermaid-svg-${Date.now()}-${i}`

    mermaid
      .render(id, source)
      .then(({ svg }) => {
        const figure = document.createElement("figure")
        figure.className = "mermaid-diagram"
        figure.innerHTML = svg
        pre.replaceWith(figure)
      })
      .catch(err => {
        // Leave the source block in place so the page still renders.
        // eslint-disable-next-line no-console
        console.error("Mermaid render failed:", err)
        delete pre.dataset.mermaidProcessed
      })
  })
}
