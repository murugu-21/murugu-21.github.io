import React from "react"
import Toggle from "react-toggle"
import moon from "../images/moon.png"
import sun from "../images/sun.png"

const ThemeToggle = () => {
  const [theme, setTheme] = React.useState(null)

  React.useEffect(() => {
    setTheme(window.__theme)
    window.__onThemeChange1 = () => {
      setTheme(window.__theme)
    }
  }, [])

  return (
    theme && (
      <Toggle
        icons={{
          checked: (
            <img
              src={moon.src}
              width={16}
              height={16}
              alt="moon image for dark mode"
            />
          ),
          unchecked: (
            <img
              src={sun.src}
              width={16}
              height={16}
              alt="sun image for light mode"
            />
          ),
        }}
        checked={theme === "dark"}
        onChange={e => {
          window.__setPreferredTheme(e.target.checked ? "dark" : "light")
        }}
        aria-label="theme toggler"
      />
    )
  )
}

export default ThemeToggle
