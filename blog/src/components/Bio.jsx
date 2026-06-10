import React from "react"
import profilePic from "../images/profile-pic.png"
import githubDark from "../images/Github-dark.png"
import githubLight from "../images/Github-light.png"
import stackOverflow from "../images/stack-overflow.png"

// Author/social data comes in as props from the Astro pages (replaces the
// Gatsby useStaticQuery for siteMetadata).
const Bio = ({ author, social }) => {
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
        <img
          className="bio-avatar"
          src={profilePic.src}
          width={50}
          height={50}
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
          <img
            src={theme === "light" ? githubDark.src : githubLight.src}
            width={32}
            height={32}
            alt={
              theme === "light"
                ? "Github profile link dark"
                : "Github profile link light"
            }
          />
        </a>
        <a
          href="https://stackoverflow.com/users/15790108/murugappan-m"
          alt="link to author's stackoverflow profile"
        >
          <img
            src={stackOverflow.src}
            width={32}
            height={32}
            alt="stackoverflow profile link"
          />
        </a>
      </div>
    </>
  )
}

export default Bio
