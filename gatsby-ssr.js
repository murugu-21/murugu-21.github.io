const React = require("react")

exports.onRenderBody = function ({ setPreBodyComponents }) {
  setPreBodyComponents([
    React.createElement("script", {
      key: "gatsby-plugin-dark-mode",
      dangerouslySetInnerHTML: {
        __html: `
void function() {
  window.__onThemeChange1 = function() {}
  window.__onThemeChange2 = function() {}
  var preferredTheme
  try {
    preferredTheme = localStorage.getItem('theme')
  } catch (err) { }
  function setTheme(newTheme) {
    if (preferredTheme && document.body.classList.contains(preferredTheme)) {
      document.body.classList.replace(preferredTheme, newTheme)
    } else {
      document.body.classList.add(newTheme)
    }
    window.__theme = newTheme
    preferredTheme = newTheme
    window.__onThemeChange1(newTheme)
    window.__onThemeChange2(newTheme)
  }
  window.__setPreferredTheme = function(newTheme) {
    setTheme(newTheme)
    try {
      localStorage.setItem('theme', newTheme)
    } catch (err) {}
  }
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
  darkQuery.addEventListener("change", function(e) {
    window.__setPreferredTheme(preferredTheme || (e.matches ? 'dark' : 'light'))
  })
  setTheme(preferredTheme || (darkQuery.matches ? 'dark' : 'light'))
}()
    `,
      },
    }),
  ])
}
