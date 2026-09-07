import Toggle from "react-toggle";
import moon from "../images/moon.png";
import sun from "../images/sun.png";
import {useTheme} from "../utils/useTheme";
import {tag} from "../../lib/analytics";

const ThemeToggle = () => {
  // null until the bootstrap script has run, which keeps the toggle out of the
  // DOM rather than rendering it in the wrong position for a frame.
  const theme = useTheme();

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
          )
        }}
        checked={theme === "dark"}
        onChange={e => {
          const next = e.target.checked ? "dark" : "light";
          window.__setPreferredTheme(next);
          // Tag, not an event: the point is filtering recordings by the theme
          // the reader actually read the post in.
          tag("theme", next);
        }}
        aria-label="theme toggler"
      />
    )
  );
};

export default ThemeToggle;
