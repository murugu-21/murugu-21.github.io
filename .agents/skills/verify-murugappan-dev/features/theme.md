# Theme

A visitor starts in their OS colour scheme and can flip between light and dark from the header on any page. The choice persists across reloads and between the portfolio and the blog.

## Sub-features

- `theme-default` follows the OS scheme when nothing is stored.
- `theme-toggle` switches the page and relabels the button with the theme it would switch to.
- `theme-persist` keeps a stored choice across navigation, and it beats the OS scheme.

## How to get to it (user POV)

- Choose the sun or moon button in the portfolio header.
- Choose the same button in the blog header.

## Driving it with chrome-devtools

Preconditions:

- No page opened yet in this run's isolated context, so `isDark` is unset.
- `E="$RUN/evidence/theme"; mkdir -p "$E"`.

Steps:

- **`theme-default`.** `new_page url: "http://localhost:8791/"`, then `emulate colorScheme: "light"` and `navigate_page type: "reload"`. `evaluate_script () => document.documentElement.classList.contains("dark-mode")` returns `false`, and `take_snapshot` shows a button named `Use dark mode`. Repeat with `colorScheme: "dark"`: it returns `true` and the button is named `Use light mode`. `take_screenshot filePath: "$E/theme-default.png"`.
- **`theme-toggle`.** `click` the `Use light mode` uid. The button's name becomes `Use dark mode`, `dark-mode` is gone from `<html>`, and `evaluate_script () => localStorage.getItem("isDark")` returns `"false"`. `take_screenshot filePath: "$E/theme-toggle.png"`.
- **`theme-persist`.** `navigate_page url: "http://localhost:8791/blog/"` with the OS still dark. The page stays light and the blog header's button is named `Use dark mode`. `take_snapshot filePath: "$E/theme-persist.aria.txt"` and `take_screenshot filePath: "$E/theme-persist.png"`.
- **Both themes.** For a UI change, open the changed page and screenshot it once in each theme by clicking the toggle between shots.

## Gotchas

- The button names the theme you'd switch to, not the current one.
- Emulating the OS scheme does nothing once `isDark` is stored. Test the default in a fresh isolated context.
- The homepage subtitle types itself out, so a screenshot can catch it half-written (`Tec`). That's the animation, not a defect.
