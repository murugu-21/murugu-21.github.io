import * as React from "react"
import Link from "next/link"
import ThemeToggler from "./themeToggle"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const isRootPath = location.pathname === rootPath
  let header

  if (isRootPath) {
    header = (
      <h1 className="main-heading">
        <Link href="/">
          <a>{title}</a>
        </Link>
      </h1>
    )
  } else {
    header = (
      <Link href="/" className="header-link-home">
        <a>{title}</a>
      </Link>
    )
  }

  return (
    <div className="global-wrapper" data-is-root-path={isRootPath}>
      <header className="global-header">
        {header}
        <ThemeToggler />
      </header>
      <main>{children}</main>
    </div>
  )
}

export default Layout
