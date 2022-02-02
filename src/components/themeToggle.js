import React from "react"
import Toggle from "react-toggle"
import { StaticImage } from "gatsby-plugin-image"

const ThemeToggler = () => {
    const [theme, setTheme] = React.useState(null)

    React.useEffect(() => {
      setTheme(window.__theme)
      window.__onThemeChange1 = () => {
        setTheme(window.__theme)
      }
    }, [])

    return (
        theme &&
        <Toggle
        icons={{
            checked: (
            <StaticImage
                layout="fixed"
                formats={["auto", "webp", "avif"]}
                src="../images/moon.png"
                width={16}
                height={16}
            />
            ),
            unchecked: (
            <StaticImage
                layout="fixed"
                formats={["auto", "webp", "avif"]}
                src="../images/sun.png"
                width={16}
                height={16}
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
}

export default ThemeToggler
