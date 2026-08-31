import ToggleModule from "react-toggle";
import moon from "../images/moon.png";
import sun from "../images/sun.png";
import {useTheme} from "../utils/useTheme";

// react-toggle is CJS-only: its package.json has `main` and no `exports`,
// `module` or `type`. This file used to live under blog/package.json, which had
// no `type` field, but the blog/portfolio merge moved it under the repo root's
// `"type": "module"` scope. That flips the bundler from `__esModule`-aware
// interop to Node's real ESM-from-CJS rules, where a default import of a CJS
// module is the whole `module.exports` object. So the default import here is
// `{__esModule: true, default: Toggle}` rather than the component, and
// rendering it threw React #130 ("element type is invalid ... got: object")
// during island hydration, which left the theme toggle missing from every blog
// page. Unwrap the inner default; the `??` keeps this correct if the import
// ever resolves straight to the component, as the dev-server prebundle does.
// Rolldown exposes no interop option to configure this, and optimizeDeps /
// noExternal do not apply to the client build, so it has to be done here.
const Toggle = ToggleModule.default ?? ToggleModule;

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
          window.__setPreferredTheme(e.target.checked ? "dark" : "light");
        }}
        aria-label="theme toggler"
      />
    )
  );
};

export default ThemeToggle;
