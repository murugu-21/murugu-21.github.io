import * as React from "react"
import { Link } from "gatsby"
import "./customToggle.css"
import Toggle from "react-toggle"
import { StaticImage } from "gatsby-plugin-image"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const isRootPath = location.pathname === rootPath
  let header

  if (isRootPath) {
    header = (
      <h1 className="main-heading">
        <Link to="/">{title}</Link>
      </h1>
    )
  } else {
    header = (
      <Link className="header-link-home" to="/">
        {title}
      </Link>
    )
  }

  const [theme, setTheme] = React.useState(null)

  React.useEffect(() => {
    setTheme(window.__theme)
    window.__onThemeChange1 = () => {
      setTheme(window.__theme)
    }
  }, [])

  return (
    <div className="global-wrapper" data-is-root-path={isRootPath}>
      <header className="global-header">
        {header}
        {theme && (
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
        )}
      </header>
      <main>{children}</main>
    </div>
  )
}

export default Layout
