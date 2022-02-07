/**
 * Bio component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.com/docs/use-static-query/
 */

import * as React from "react"
import { useStaticQuery, graphql } from "gatsby"
import { StaticImage } from "gatsby-plugin-image"

const Bio = () => {
  const data = useStaticQuery(graphql`
    query BioQuery {
      site {
        siteMetadata {
          author {
            name
            summary
          }
          social {
            twitter
          }
        }
      }
    }
  `)

  // Set these values by editing "siteMetadata" in gatsby-config.js
  const author = data.site.siteMetadata?.author
  const social = data.site.siteMetadata?.social

  const [theme, setTheme] = React.useState(null)

  React.useEffect(() => {
    setTheme(window.__theme)
    window.__onThemeChange2 = () => {
      setTheme(window.__theme)
    }
  }, [])

  return (
    <>
      <div className="bio">
        <StaticImage
          className="bio-avatar"
          layout="fixed"
          formats={["auto", "webp", "avif"]}
          src="../images/profile-pic.png"
          width={50}
          height={50}
          quality={95}
          alt="Profile picture"
        />
        {author?.name && (
          <p>
            technical blog by{" "}
            <a href={`https://twitter.com/${social?.twitter || ``}`}>
              <strong>{author.name}</strong>
            </a>
            <br></br>
            {author?.summary || null}
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "row", gap: "1rem" }}>
        <a
          href="https://github.com/murugu-21"
          alt="link to author's github profile"
        >
          {theme === "light" ? (
            <StaticImage
              layout="fixed"
              formats={["auto", "webp", "avif"]}
              src="../images/Github-dark.png"
              width={32}
              height={32}
              quality={95}
              alt="Github profile link dark"
            />
          ) : (
            <StaticImage
              layout="fixed"
              formats={["auto", "webp", "avif"]}
              src="../images/Github-light.png"
              width={32}
              height={32}
              quality={95}
              alt="Github profile link light"
            />
          )}
        </a>
        <a
          href="https://stackoverflow.com/users/15790108/murugappan-m"
          alt="link to author's stackoverflow profile"
        >
          <StaticImage
            layout="fixed"
            formats={["auto", "webp", "avif"]}
            src="../images/stack-overflow.png"
            width={32}
            height={32}
            quality={95}
            alt="stackoverflow profile link"
          />
        </a>
      </div>
    </>
  )
}

export default Bio
