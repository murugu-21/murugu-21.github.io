# Home page

The home page opens on the greeting and the round portrait, framed by a watch-like ring of ticks that turns into place on load. The ring is decoration: it never covers the greeting text, never makes the page scroll sideways, stays still for visitors who prefer reduced motion, and is left out of print.

## Sub-features

- `home-ring-fit` keeps the ring inside its column at every width.
- `home-ring-motion` settles the ring once on load, and not at all under reduced motion.
- `home-ring-print` hides the ring when the page is printed.

## How to get to it (user POV)

- Open `/`.

## Driving it with chrome-devtools

Preconditions:

- `new_page url: "http://localhost:8791/"` in this run's isolated context.
- `E="$RUN/evidence/home"; mkdir -p "$E"`.

Steps:

- **`home-ring-fit`.** For each width in 375, 820, 1024 and 1280, `resize_page` to it and reload. `evaluate_script () => document.documentElement.scrollWidth === document.documentElement.clientWidth` returns `true`. `take_screenshot filePath: "$E/ring-<width>.png"` shows no tick over the greeting text.
- **`home-ring-motion`.** `emulate reducedMotion: "reduce"` if the harness offers it, reload, then `evaluate_script () => document.querySelector('#greeting svg[viewBox="-125 -125 250 250"]').getAnimations().length` returns `0`.
- **`home-ring-print`.** `evaluate_script () => matchMedia("print").matches` is `false` on screen; with print emulation, `getComputedStyle(document.querySelector('#greeting svg[viewBox="-125 -125 250 250"]')).display` returns `"none"`.

## Gotchas

- The ring turns into place for about a second after load. Screenshot once it settles.
- The greeting's subtitle types itself out, so a screenshot can catch it half-written.
