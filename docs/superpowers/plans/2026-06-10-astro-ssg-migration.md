# Astro SSG Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CRA/React-16 developerFolio portfolio with an Astro v5 static site (pixel-faithful, zero-JS-by-default) so murugappan.dev scores materially better on Lighthouse and is fully crawlable as static HTML.

**Architecture:** One Astro page (`src/pages/index.astro`) composes `.astro` section components ported from the old React containers, styled by the ported SCSS. All data renders at build time — including the GitHub profile (GraphQL at build) and experience-card banner colors (computed from logo PNGs at build with `sharp`). Only three things ship JS: a pre-paint theme script, a theme-toggle handler, and lazy lottie players.

**Tech Stack:** Astro ^5, sass, sharp (build-time only), lottie-web (lazy island), GitHub GraphQL API, GitHub Actions + JamesIves/github-pages-deploy-action.

**Branch:** `astro-migration` (already exists; spec committed). Old React source remains readable during the port via `git show main:<path>`.

**Spec:** `docs/superpowers/specs/2026-06-10-astro-ssg-migration-design.md`

---

## File structure (target)

```
astro.config.mjs                  Astro config (site, static output)
package.json                      NEW — astro/sass/sharp/lottie-web only
tsconfig.json                     Astro default (strict)
src/
  data/portfolio.ts               content (ported from old src/portfolio.js, emoji() stripped)
  lib/github.ts                   build-time GitHub GraphQL fetch + null fallback
  lib/logoColor.ts                build-time average-color from logo PNG (sharp)
  layouts/Layout.astro            <head> (SEO meta, JSON-LD, GA4, fonts, theme pre-paint), body shell
  styles/global.scss              _globalColor.scss vars + fonts + App/Main global styles
  components/
    Header.astro                  nav + hamburger (CSS-only) + ThemeToggle
    ThemeToggle.astro             toggle island (small inline script)
    SocialMedia.astro             icon links
    Button.astro                  green button/link
    LottiePlayer.astro            lazy lottie island (IntersectionObserver + lottie-web)
    Greeting.astro                hero
    Skills.astro                  skills section (codingPerson lottie + icons)
    Proficiency.astro             skill bars
    Education.astro               education card
    WorkExperience.astro          experience cards (build-time banner color)
    OpenSource.astro              AnkiDroid achievement card
    Blogs.astro                   blog cards
    GithubCard.astro              build-time GitHub profile card; fallback = contact block
    Footer.astro                  footer + attribution
    ScrollTop.astro               scroll-to-top button (tiny script)
  pages/index.astro               composes all sections in old Main.js order
src/assets/                       KEPT AS-IS: fonts/, images/, lottie/ (landingPerson, codingPerson)
public/                           KEPT AS-IS: CNAME, redirect stubs, og-image.png, robots.txt,
                                  sitemap.xml, llms.txt, favicons, manifest.json
REMOVED: old src/components, src/containers, src/contexts, src/hooks, src/App.*, src/index.*,
         src/serviceWorker.js, src/_globalColor.scss (ported), fetch.js, env.example,
         Dockerfile, .all-contributorsrc, old package-lock.json/yarn.lock
```

Key facts from the old app (verified):
- Theme = localStorage key `isDark` (JSON bool, default `prefers-color-scheme: dark`), class `dark-mode` on the root wrapper.
- Section order (old `Main.js`): Header, Greeting, Skills, StackProgress(Proficiency), Education, WorkExperience, ~~Projects~~(hidden), ~~StartupProject~~(empty), Achievement(OpenSource), Blogs, ~~Talks/Twitter/Podcast~~(disabled), Profile(GithubCard), Footer, ScrollTop.
- GA4 tag: `G-EGG005JECM`. Splash screen: dropped per spec.
- GitHub GraphQL query (from `fetch.js`): user → name, bio, avatarUrl, location (pinned repos not displayed).

---

### Task 1: Scaffold the Astro app (CRA out, Astro in, build green)

**Files:**
- Create: `package.json` (replace), `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro` (placeholder), `src/layouts/Layout.astro` (minimal)
- Delete: `src/App.js`, `src/App.scss`, `src/App.test.js`, `src/index.js`, `src/index.css`, `src/serviceWorker.js`, `src/setupTests.js`, `src/utils.js`, `src/logo.svg`, `src/portfolio.js` (ported in Task 3), `src/components/`, `src/containers/`, `src/contexts/`, `src/hooks/`, `fetch.js`, `env.example`, `Dockerfile`, `.all-contributorsrc`, `package-lock.json`
- Keep untouched: `src/assets/**`, `public/**`, `.github/**`, `docs/**`, `src/_globalColor.scss` (deleted in Task 2 after porting)

- [ ] **Step 1: Confirm you are on the `astro-migration` branch with a clean tree**

Run: `cd /Users/murugappan/personal/murugu-21.github.io && git status --short && git branch --show-current`
Expected: `astro-migration`, no uncommitted changes.

- [ ] **Step 2: Delete CRA source (git rm keeps history; old code stays readable via `git show main:<path>`)**

```bash
git rm -rq src/components src/containers src/contexts src/hooks
git rm -q src/App.js src/App.scss src/App.test.js src/index.js src/index.css \
  src/serviceWorker.js src/setupTests.js src/utils.js src/logo.svg \
  fetch.js env.example Dockerfile .all-contributorsrc package-lock.json
```

- [ ] **Step 3: Write the new `package.json`** (replaces the CRA one entirely)

```json
{
  "name": "murugappan-dev",
  "private": true,
  "type": "module",
  "version": "2.0.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "format": "prettier --write \"src/**/*.{astro,ts,scss}\""
  },
  "dependencies": {
    "astro": "^5.0.0",
    "lottie-web": "^5.12.2"
  },
  "devDependencies": {
    "prettier": "^3.0.0",
    "prettier-plugin-astro": "^0.14.0",
    "sass": "^1.69.0",
    "sharp": "^0.33.0"
  }
}
```

- [ ] **Step 4: Write `astro.config.mjs`**

```js
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://murugappan.dev",
  output: "static",
  build: { assets: "static" },
});
```

- [ ] **Step 5: Write `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "src/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 6: Write minimal `src/layouts/Layout.astro`** (fleshed out in Task 2)

```astro
---
const { title = "Murugappan M | Full Stack Engineer" } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 7: Write placeholder `src/pages/index.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
---
<Layout>
  <h1>Astro scaffold OK</h1>
</Layout>
```

- [ ] **Step 8: Install and build (Node 20 — `nvm use 20`)**

Run: `nvm use 20 && npm install && npm run build`
Expected: `astro build` completes; `dist/index.html` exists and contains `Astro scaffold OK`. Also verify public passthrough: `ls dist/CNAME dist/llms.txt dist/429-googleapis/index.html` all exist.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Astro 5 app, remove CRA source (assets/public kept)"
```

---

### Task 2: Global styles, fonts, full SEO head, theme pre-paint

**Files:**
- Create: `src/styles/global.scss`
- Modify: `src/layouts/Layout.astro`
- Delete: `src/_globalColor.scss` (after porting)

- [ ] **Step 1: Create `src/styles/global.scss`** — concatenate, in this order, the contents of these old files (read each with `git show`):
  1. `git show main:src/_globalColor.scss` — paste verbatim (the green palette).
  2. Font faces (replaces old `src/index.css` `@font-face`; note `src/assets/fonts/` paths still exist):

```scss
@font-face {
  font-family: "Agustina Regular";
  font-style: normal;
  font-weight: normal;
  src: url("../assets/fonts/Agustina.woff") format("woff");
  font-display: swap;
}
@font-face {
  font-family: "Montserrat";
  src: url("../assets/fonts/Montserrat-Regular.ttf") format("truetype");
  font-display: swap;
}
```

  3. The body/global rules from `git show main:src/index.css` (body font-family, margins) and `git show main:src/App.scss` + `git show main:src/containers/Main.scss` — paste, then make ONE change: every `.dark-mode` rule that targeted the React root wrapper applies the same on `body.dark-mode` (global theme class now lives on `<body>`). Descendant selectors (`.dark-mode .foo`) work unchanged.

- [ ] **Step 2: Replace `src/layouts/Layout.astro` with the full head** (this is the complete SEO carry-over from `git show main:public/index.html` plus the theme pre-paint script and GA4):

```astro
---
import "../styles/global.scss";
const description =
  "Murugappan M — Full-Stack Engineer building cloud-native, event-driven B2B SaaS on AWS. Experience, skills, and projects.";
const title = "Murugappan M | Full Stack Engineer";
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="title" content={title} />
    <meta name="description" content={description} />
    <link rel="canonical" href="https://murugappan.dev/" />

    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://murugappan.dev/" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content="https://murugappan.dev/og-image.png" />

    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content="https://murugappan.dev/" />
    <meta property="twitter:title" content={title} />
    <meta property="twitter:description" content={description} />
    <meta property="twitter:image" content="https://murugappan.dev/og-image.png" />

    <meta name="msapplication-TileColor" content="#057b01" />
    <meta name="theme-color" content="#057b01" />

    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="shortcut icon" href="/favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />

    <!-- Theme before first paint: localStorage "isDark" (JSON bool), default = OS preference -->
    <script is:inline>
      (function () {
        try {
          var stored = localStorage.getItem("isDark");
          var dark =
            stored !== null
              ? JSON.parse(stored)
              : window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (dark) document.documentElement.classList.add("dark-mode");
        } catch (e) {}
      })();
    </script>

    <!-- Structured data: Person (carried over verbatim from the CRA index.html) -->
    <script
      type="application/ld+json"
      set:html={JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Murugappan M",
        url: "https://murugappan.dev",
        image: "https://murugappan.dev/og-image.png",
        jobTitle: "Full Stack Engineer",
        description:
          "Full-Stack Engineer with 3+ years building cloud-native, event-driven B2B SaaS on AWS (TypeScript, React, Node.js).",
        worksFor: { "@type": "Organization", name: "MedMe Health" },
        alumniOf: { "@type": "CollegeOrUniversity", name: "Kumaraguru College of Technology" },
        knowsAbout: ["TypeScript", "Node.js", "React", "AWS", "Distributed systems", "Event-driven architecture", "Observability", "SOC 2", "HIPAA"],
        sameAs: [
          "https://github.com/murugu-21",
          "https://www.linkedin.com/in/murugappan-m-56920a192/",
          "https://twitter.com/murugu21",
          "https://stackoverflow.com/users/15790108/murugappan-m",
        ],
      })}
    />

    <!-- GA4, deferred so it never blocks paint -->
    <script is:inline defer src="https://www.googletagmanager.com/gtag/js?id=G-EGG005JECM"></script>
    <script is:inline>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "G-EGG005JECM");
    </script>

    <!-- Font Awesome for skill/social icons, same as the CRA app -->
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/FortAwesome/Font-Awesome@5.15.4/css/all.min.css"
      media="print"
      onload="this.media='all'"
    />
  </head>
  <body>
    <slot />
  </body>
</html>
```

NOTE on theme class: the pre-paint script puts `dark-mode` on `<html>` (`document.documentElement`) — so in `global.scss` use `html.dark-mode` (or just `.dark-mode` ancestor selectors, which match either way). Be consistent: **the class lives on `<html>`, not `<body>`** (documentElement is available before body parses). Update the Step-1 instruction accordingly: root-level dark rules go on `html.dark-mode body` / `.dark-mode` descendants.

- [ ] **Step 3: Delete the now-ported `src/_globalColor.scss`**

```bash
git rm -q src/_globalColor.scss
```

- [ ] **Step 4: Build and verify head output**

Run: `npm run build && grep -c 'rel="canonical"' dist/index.html && grep -c 'application/ld+json' dist/index.html && grep -c 'G-EGG005JECM' dist/index.html`
Expected: each grep ≥ 1; build clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: global styles, fonts (display:swap), full SEO head, pre-paint theme, GA4"
```

---

### Task 3: Content data module

**Files:**
- Create: `src/data/portfolio.ts`

- [ ] **Step 1: Read the old data**

Run: `git show main:src/portfolio.js`

- [ ] **Step 2: Create `src/data/portfolio.ts`** — port every exported object the new site needs, stripping `emoji(...)` wrappers (keep the unicode emoji characters in the strings) and `require(...)` image calls (replace with imported asset paths). Skeleton with required types — fill arrays with the EXACT content from Step 1:

```ts
import medmeLogo from "../assets/images/medmeLogo.png";
import hypervergeLogo from "../assets/images/hypervergeLogo.png";
import samsungLogo from "../assets/images/samsungLogo.png";
import kumaraguruLogo from "../assets/images/kumaraguruLogo.png";

export const greeting = {
  username: "Murugappan M",
  title: "Hi all, I'm Murugappan",
  subTitle:
    "Full-Stack Engineer with 3+ years building cloud-native B2B SaaS in regulated domains (LLM-powered CLM, healthcare) 🚀. TypeScript across the stack — from React frontends to event-driven Node.js services on AWS. Founding engineer on a product scaled to $300k ARR, with a strong focus on distributed systems, observability, and security/compliance (SOC 2, HIPAA).",
  resumePath: "/resume.pdf",
};

export const socialMediaLinks = {
  github: "https://github.com/murugu-21",
  linkedin: "https://www.linkedin.com/in/murugappan-m-56920a192/",
  gmail: "murugu2001@gmail.com",
  stackoverflow: "https://stackoverflow.com/users/15790108/murugappan-m",
  twitter: "https://twitter.com/murugu21",
};

export interface SoftwareSkill { skillName: string; fontAwesomeClassname: string; }
export const skillsSection: {
  title: string; subTitle: string; skills: string[]; softwareSkills: SoftwareSkill[];
} = { /* exact content from old portfolio.js, emoji() stripped */ } as any;

export const techStack = { /* exact content: viewSkillBars + 3 experience bars */ } as any;

export interface WorkExperience {
  role: string; company: string; companylogo: ImageMetadata; date: string;
  desc: string; descBullets?: string[];
}
export const workExperiences: WorkExperience[] = [
  /* 5 entries, exact content; companylogo: medmeLogo | hypervergeLogo | samsungLogo */
];

export const educationInfo = [
  {
    schoolName: "Kumaraguru College of Technology",
    logo: kumaraguruLogo,
    subHeader: "Bachelor of Engineering in Computer Science",
    duration: "June 2019 - April 2023",
    desc: "Coimbatore, India.",
    descBullets: ["Graduated with a focus on distributed systems, databases, and software engineering."],
  },
];

export const openSourceCard = { /* exact AnkiDroid achievementsCards[0] content incl. footerLink */ } as any;

export const blogSection = { /* exact title/subtitle/blogs[] from old file */ } as any;

export const contactInfo = {
  title: "Contact Me ☎️",
  subtitle: "Open to relocation & visa sponsorship. Want to discuss a project, a role, or just say hi? My inbox is open.",
  number: "+91-9095298712",
  email_address: "murugu2001@gmail.com",
};

export const isHireable = true;
```

IMPORTANT: replace every `as any` skeleton with the fully-typed literal content — no `as any` may remain in the committed file. The resume: copy the old one into public:

```bash
git show main:src/containers/greeting/resume.pdf > public/resume.pdf
```

- [ ] **Step 3: Typecheck/build**

Run: `npx astro check 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: no errors (warnings OK), build green.

- [ ] **Step 4: Commit**

```bash
git add src/data/portfolio.ts public/resume.pdf
git commit -m "feat: typed content data module ported from portfolio.js"
```

---

### Task 4: Header with CSS hamburger + theme toggle island

**Files:**
- Create: `src/components/Header.astro`, `src/components/ThemeToggle.astro`

- [ ] **Step 1: Read old sources for markup/classes**

Run: `git show main:src/components/header/Header.js`, `git show main:src/components/header/Header.scss`, `git show main:src/components/ToggleSwitch/ToggleSwitch.js`, `git show main:src/components/ToggleSwitch/ToggleSwitch.scss`

- [ ] **Step 2: Create `src/components/Header.astro`** — same markup/classes as old Header.js (logo `<Murugappan M/>`, checkbox hamburger `menu-btn`, nav list: Skills, Work Experiences, Achievements, Blogs, Resume, Contact Me), with `<style lang="scss">` containing the old Header.scss verbatim (including our `.logo-name` green fix and subtle dark hover). Replace react-headroom with `position: sticky; top: 0; z-index: 999;` on the header wrapper. Theme-dependent classes (`dark-menu`) become CSS driven by the global class: where old JSX did `isDark ? "dark-menu header" : "header"`, emit `class="header"` and add SCSS `html.dark-mode .header { /* the .dark-menu rules */ }` (copy rule bodies from old `.dark-menu` selectors).

```astro
---
import ThemeToggle from "./ThemeToggle.astro";
const links = [
  { href: "#skills", label: "Skills" },
  { href: "#experience", label: "Work Experiences" },
  { href: "#achievements", label: "Achievements" },
  { href: "#blogs", label: "Blogs" },
  { href: "#resume", label: "Resume" },
  { href: "#contact", label: "Contact Me" },
];
---
<header class="header">
  <a href="/" class="logo">
    <span class="grey-color">&lt;</span>
    <span class="logo-name">Murugappan M</span>
    <span class="grey-color">/&gt;</span>
  </a>
  <input class="menu-btn" type="checkbox" id="menu-btn" />
  <label class="menu-icon" for="menu-btn"><span class="navicon"></span></label>
  <ul class="menu">
    {links.map((l) => (<li><a href={l.href}>{l.label}</a></li>))}
    <li><ThemeToggle /></li>
  </ul>
</header>
<style lang="scss">/* old Header.scss, adapted per Step-2 notes */</style>
```

(The `<style>` block must contain the real ported SCSS before commit — an empty/comment-only style block is a task failure.)

- [ ] **Step 3: Create `src/components/ThemeToggle.astro`** — checkbox styled by the old ToggleSwitch.scss (sun 🌞 / moon 🌜 emoji), with this exact behavior script:

```astro
<label class="switch">
  <input type="checkbox" id="theme-toggle" aria-label="theme toggler" />
  <span class="slider round">
    <span class="toggle-emoji" aria-hidden="true"></span>
  </span>
</label>
<style lang="scss">/* old ToggleSwitch.scss ported */</style>
<script>
  const box = document.getElementById("theme-toggle") as HTMLInputElement;
  const root = document.documentElement;
  box.checked = root.classList.contains("dark-mode");
  box.addEventListener("change", () => {
    root.classList.toggle("dark-mode", box.checked);
    try { localStorage.setItem("isDark", JSON.stringify(box.checked)); } catch {}
  });
</script>
```

- [ ] **Step 4: Mount in `src/pages/index.astro`** (replace placeholder body):

```astro
---
import Layout from "../layouts/Layout.astro";
import Header from "../components/Header.astro";
---
<Layout>
  <Header />
</Layout>
```

- [ ] **Step 5: Build + manual check**

Run: `npm run build && npm run preview &` then open http://localhost:4321 — header renders, toggle flips dark/light and persists across reload, hamburger works at mobile width (devtools). Kill preview after.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.astro src/components/ThemeToggle.astro src/pages/index.astro
git commit -m "feat: header with CSS hamburger and no-FOUC theme toggle island"
```

---

### Task 5: Lottie island + Greeting (hero) + SocialMedia + Button

**Files:**
- Create: `src/components/LottiePlayer.astro`, `src/components/SocialMedia.astro`, `src/components/Button.astro`, `src/components/Greeting.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create `src/components/LottiePlayer.astro`** — lazy loads lottie-web only when visible:

```astro
---
interface Props { src: string; label: string; }
const { src, label } = Astro.props;
---
<div class="lottie-holder" data-lottie-src={src} role="img" aria-label={label}></div>
<script>
  const holders = document.querySelectorAll<HTMLElement>(".lottie-holder");
  const io = new IntersectionObserver((entries) => {
    entries.forEach(async (e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const lottie = (await import("lottie-web/build/player/lottie_light")).default;
      const data = await fetch(el.dataset.lottieSrc!).then((r) => r.json());
      lottie.loadAnimation({ container: el, renderer: "svg", loop: true, autoplay: true, animationData: data });
    });
  }, { rootMargin: "120px" });
  holders.forEach((h) => io.observe(h));
</script>
```

The lottie JSONs move to public so they're fetchable: 

```bash
git mv src/assets/lottie/landingPerson.json public/lottie-landing.json
git mv src/assets/lottie/codingPerson.json public/lottie-coding.json
git rm -q src/assets/lottie/splashAnimation.json src/assets/lottie/build.json src/assets/lottie/email.json
```

(splash dropped per spec; build/email animations were never rendered.)

- [ ] **Step 2: Create `src/components/Button.astro`** (old `button/Button.js` + `Button.scss`):

```astro
---
interface Props { text: string; href: string; download?: string; newTab?: boolean; }
const { text, href, download, newTab } = Astro.props;
---
<div class="main-button-container">
  <a class="main-button" href={href} download={download} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener" : undefined}>{text}</a>
</div>
<style lang="scss">/* old Button.scss ported */</style>
```

- [ ] **Step 3: Create `src/components/SocialMedia.astro`** — emit the same `<a class="icon-button github"><i class="fab fa-github"></i></a>` markup as `git show main:src/components/socialMedia/SocialMedia.js` for github, linkedin, gmail (mailto), twitter, stackoverflow; style = old SocialMedia.scss verbatim (with our green hover fix).

- [ ] **Step 4: Create `src/components/Greeting.astro`** — markup from `git show main:src/containers/greeting/Greeting.js` minus react-reveal wrapper; left column (title with 👋, subtitle, SocialMedia, Contact-me + Download-resume Buttons), right column `<LottiePlayer src="/lottie-landing.json" label="developer illustration" />`; style from `git show main:src/containers/greeting/Greeting.scss`. Add the CSS entrance animation used site-wide — put once in `global.scss`:

```scss
@keyframes rise-fade { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
.section-animate { animation: rise-fade 1s ease both; }
@media (prefers-reduced-motion: reduce) { .section-animate { animation: none; } }
```

and give each section root `class="... section-animate"`.

- [ ] **Step 5: Mount Greeting in index.astro after Header; build + preview**

Run: `npm run build && grep -c "lottie-holder" dist/index.html`
Expected: 1 (greeting lottie). Preview: hero pixel-matches live site (text, buttons, socials), lottie animates when visible, **no lottie JS in the initial bundle** (Network tab: lottie chunk loads only on scroll-into-view/visible).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: hero section with lazy lottie island, social icons, buttons"
```

---

### Task 6: Skills + Proficiency sections

**Files:**
- Create: `src/components/Skills.astro`, `src/components/Proficiency.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Skills.astro** — sources: `git show main:src/containers/skills/Skills.js`, `Skills.scss`, and `git show main:src/components/softwareSkills/SoftwareSkill.js` + `.scss`. Structure: `<div id="skills" class="skills-main-div section-animate">` with left `<LottiePlayer src="/lottie-coding.json" label="coder illustration" />`, right: heading "What I do", subtitle, FA icon list from `skillsSection.softwareSkills`, and the three ⚡ skill lines. SCSS ported verbatim; `dark-mode` text rules become `html.dark-mode` descendants.

- [ ] **Step 2: Proficiency.astro** — sources: `git show main:src/containers/skillProgress/skillProgress.js` + `.scss`. Render `techStack.experience` bars statically (`<div class="meter"><span style={`width:${p.progressPercentage}`}>`). The Build lottie column was conditional and is not rendered (viewSkillBars=true ⇒ bars only) — omit it.

- [ ] **Step 3: Mount both in index.astro (after Greeting), build + preview compare vs live**

Run: `npm run build`
Expected: green; preview shows icons row, ⚡ lines, three green bars at 90/85/80%.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: skills and proficiency sections (static bars, lazy lottie)"
```

---

### Task 7: Education + WorkExperience with build-time logo colors

**Files:**
- Create: `src/lib/logoColor.ts`, `src/components/Education.astro`, `src/components/WorkExperience.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create `src/lib/logoColor.ts`** (build-time average color via sharp; replaces client color-thief):

```ts
import sharp from "sharp";
import { fileURLToPath } from "node:url";

/** Average color of an image as "rgb(r, g, b)". Runs at build time only. */
export async function averageColor(imgUrl: string): Promise<string> {
  // imgUrl is the Vite-resolved asset URL; map back to the source file on disk
  const fsPath = imgUrl.startsWith("/@fs")
    ? imgUrl.replace("/@fs", "").split("?")[0]
    : fileURLToPath(new URL(`../assets/images/${imgUrl.split("/").pop()!.split("?")[0]}`, import.meta.url));
  const { data } = await sharp(fsPath).resize(1, 1, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
  return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
}
```

NOTE: simpler and more robust — have `portfolio.ts` also export plain source paths for the three logos (`new URL("../assets/images/medmeLogo.png", import.meta.url)`) used ONLY by this lib; if the `/@fs` mapping proves brittle during implementation, switch to that and delete the mapping logic. Pick one approach; do not ship both.

- [ ] **Step 2: Education.astro** — sources: `git show main:src/containers/education/Education.js`, `git show main:src/components/educationCard/EducationCard.js` + both `.scss`. Static card: KCT logo `<img>` (Astro `<Image>` optional; plain img with width/height attributes is fine and avoids CLS), name, degree, duration, desc, bullet.

- [ ] **Step 3: WorkExperience.astro** — sources: `git show main:src/containers/workExperience/WorkExperience.js`, `git show main:src/components/experienceCard/ExperienceCard.js` + `.scss`. In frontmatter:

```astro
---
import { workExperiences } from "../data/portfolio";
import { averageColor } from "../lib/logoColor";
const cards = await Promise.all(
  workExperiences.map(async (w) => ({ ...w, banner: await averageColor(w.companylogo.src) }))
);
---
```

Card markup mirrors old ExperienceCard (banner div gets `style={`background:${c.banner}`}`, rounded logo img with explicit width/height, role/date/desc/bullets). SCSS ported verbatim.

- [ ] **Step 4: Mount (order: Education then WorkExperience, matching old Main.js), build, verify banner colors inline**

Run: `npm run build && grep -o 'background:rgb([0-9, ]*)' dist/index.html | sort -u`
Expected: 3 distinct rgb() values inlined (MedMe teal-ish; HyperVerge & Samsung near-white).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: education and experience sections with build-time banner colors"
```

---

### Task 8: OpenSource (AnkiDroid) + Blogs sections

**Files:**
- Create: `src/components/OpenSource.astro`, `src/components/Blogs.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: OpenSource.astro** — sources: `git show main:src/containers/achievement/Achievement.js`, `git show main:src/components/achievementCard/AchievementCard.js` + `.scss`. One static card from `openSourceCard` (AnkiDroid logo URL img, title, subtitle, 4 footer links opening in new tabs — plain `<a target="_blank" rel="noopener">`, not JS `window.open`). Section id `achievements`, heading "Open Source Contributions 🌐".

- [ ] **Step 2: Blogs.astro** — sources: `git show main:src/containers/blogs/Blogs.js`, `git show main:src/components/blogCard/BlogCard.js` + `.scss`. Three static cards from `blogSection.blogs`, each an `<a href={blog.url}>` (fix vs old behavior: cards must link to the real post URLs, e.g. `https://murugappan.dev/blog/429-googleapis/`, not `#blog`). Section id `blogs`.

- [ ] **Step 3: Mount, build, link check**

Run: `npm run build && grep -o 'href="https://murugappan.dev/blog/[^"]*"' dist/index.html | sort -u`
Expected: the blog post URLs from `blogSection` appear.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: open-source contributions and blogs sections (static, real links)"
```

---

### Task 9: GithubCard (build-time fetch) + Footer + ScrollTop

**Files:**
- Create: `src/lib/github.ts`, `src/components/GithubCard.astro`, `src/components/Footer.astro`, `src/components/ScrollTop.astro`
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Create `src/lib/github.ts`**:

```ts
export interface GithubProfile {
  name: string; bio: string | null; avatarUrl: string; location: string | null;
}

/** Build-time fetch of the GitHub profile. Returns null on any failure (build must not break). */
export async function fetchGithubProfile(): Promise<GithubProfile | null> {
  const token = process.env.GITHUB_TOKEN ?? process.env.REACT_APP_GITHUB_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "astro-build" },
      body: JSON.stringify({
        query: `{ user(login: "murugu-21") { name bio avatarUrl location } }`,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.user ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: GithubCard.astro** — sources: `git show main:src/components/githubProfileCard/GithubProfileCard.js` + `.scss`, and old `Contact.js` for the fallback. Frontmatter: `const prof = await fetchGithubProfile();` If `prof` → render the profile card statically (avatar `<img src={prof.avatarUrl} width="200" height="200" crossorigin="anonymous">`, bio, location pin, contactInfo subtitle, SocialMedia, "Open for opportunities: Yes"). If `null` → render the plain contact block (title, subtitle, phone `tel:` link, email `mailto:` link, SocialMedia) — mirrors old `Profile.js` fallback. Section id `contact`.

- [ ] **Step 3: Footer.astro** — from `git show main:src/components/footer/Footer.js` + `.scss` ("Made with ❤️ by DeveloperFolio Team" + "Theme by developerFolio" link, native emoji).

- [ ] **Step 4: ScrollTop.astro** — from `git show main:src/containers/topbutton/Top.js` + `Top.scss`:

```astro
<button id="topButton" aria-label="Back to top" title="Go to top">
  <i class="fas fa-hand-point-up" aria-hidden="true"></i>
</button>
<style lang="scss">/* old Top.scss ported; #topButton { display: none; position: fixed; ... } */</style>
<script>
  const btn = document.getElementById("topButton")!;
  window.addEventListener("scroll", () => {
    btn.style.display = window.scrollY > 20 ? "block" : "none";
  }, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
</script>
```

- [ ] **Step 5: Final index.astro composition** (complete file):

```astro
---
import Layout from "../layouts/Layout.astro";
import Header from "../components/Header.astro";
import Greeting from "../components/Greeting.astro";
import Skills from "../components/Skills.astro";
import Proficiency from "../components/Proficiency.astro";
import Education from "../components/Education.astro";
import WorkExperience from "../components/WorkExperience.astro";
import OpenSource from "../components/OpenSource.astro";
import Blogs from "../components/Blogs.astro";
import GithubCard from "../components/GithubCard.astro";
import Footer from "../components/Footer.astro";
import ScrollTop from "../components/ScrollTop.astro";
---
<Layout>
  <Header />
  <Greeting />
  <Skills />
  <Proficiency />
  <Education />
  <WorkExperience />
  <OpenSource />
  <Blogs />
  <GithubCard />
  <Footer />
  <ScrollTop />
</Layout>
```

- [ ] **Step 6: Build twice — with and without token**

Run: `npm run build && grep -c 'id="contact"' dist/index.html` (no token locally → fallback contact block renders, phone+email present: `grep -c 'tel:+91-9095298712' dist/index.html` = 1).
Then: `GITHUB_TOKEN=$(gh auth token 2>/dev/null) npm run build && grep -c 'avatars.githubusercontent.com' dist/index.html` — if a token is available expect ≥1 (profile card rendered); if not, note it and rely on CI verification.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build-time GitHub profile card with contact fallback, footer, scroll-top"
```

---

### Task 10: Deploy workflow + repo hygiene

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Delete: `.github/workflows/prettier.yml` check step incompatibilities (keep workflow but point at new format script), `public/profile.json`/`public/blogs.json` gitignore entries stay harmless

- [ ] **Step 1: Rewrite `.github/workflows/deploy.yml`**:

```yaml
name: Build and Deploy
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # build-time GitHub profile fetch
on:
  workflow_dispatch:
  push:
    branches:
      - main
  schedule:
    - cron: "0 12 * * 1" # weekly refresh of build-time GitHub data
permissions:
  contents: write # allow the deploy bot to push to gh-pages
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Deploy
        uses: JamesIves/github-pages-deploy-action@v4
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BRANCH: gh-pages
          FOLDER: dist
```

- [ ] **Step 2: Update `.github/workflows/prettier.yml`** check to `npx prettier -c "src/**/*.{astro,ts,scss}"` (or delete the workflow if simpler — decide by reading it; keep formatting enforced either way).

- [ ] **Step 3: Run prettier + a final clean build**

Run: `npx prettier --write "src/**/*.{astro,ts,scss}" && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "ci: build Astro on Node 20 and deploy dist/ to gh-pages (weekly data refresh kept)"
```

---

### Task 11: Verification gate (spec §Verification — all five must pass)

**Files:** none (verification only; fix-forward commits allowed)

- [ ] **Step 1: Clean build + preview**

Run: `npm run build && npm run preview` (background) → http://localhost:4321 returns 200.

- [ ] **Step 2: Screenshot every section, light AND dark, against live murugappan.dev** — use the chrome-devtools MCP: snapshot/screenshot preview hero/skills/proficiency/education/experience/opensource/blogs/contact/footer in both themes; compare against the live site. Differences must be: no splash, native emoji, CSS entrance animation. Anything else → fix before proceeding.

- [ ] **Step 3: Lighthouse delta** — run the chrome-devtools `lighthouse_audit` against live `https://murugappan.dev/` (baseline) and against the local preview URL. Record all four category scores for both in the PR/commit message. Gate: new ≥ old in every category, performance materially up.

- [ ] **Step 4: SEO assets in dist**

Run:
```bash
ls dist/CNAME dist/og-image.png dist/robots.txt dist/sitemap.xml dist/llms.txt dist/resume.pdf
grep -c 'rel="canonical"' dist/index.html
grep -c '"@type":"Person"' dist/index.html
grep -o 'url=https://murugappan.dev/blog/429-googleapis/' dist/429-googleapis/index.html
```
Expected: all files exist; greps ≥1; redirect stub intact.

- [ ] **Step 5: Behavior checks** — theme toggle flips + persists + no FOUC on hard reload; lotties animate in both themes; hamburger menu opens/closes at 375px width; scroll-top button appears after scrolling and works.

- [ ] **Step 6: Commit any fixes; then push branch**

```bash
git push -u origin astro-migration
```

---

### Task 12: Cutover

- [ ] **Step 1: Merge to main** (user said merges can be driven by the agent; announce before doing it):

```bash
git checkout main && git pull origin main
git merge --no-ff astro-migration -m "Migrate portfolio to Astro static site generation"
git push origin main
```

- [ ] **Step 2: Watch deploy + verify live**

Poll until the new bundle serves, then:
```bash
curl -s https://murugappan.dev/ | grep -c 'astro'           # Astro-generated markup present
curl -s -o /dev/null -w "%{http_code}\n" https://murugappan.dev/llms.txt   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://murugappan.dev/429-googleapis/  # 200 (redirect stub)
```
Re-run Lighthouse against live; confirm the recorded delta holds. Hard-reload note to user (browser cache).

- [ ] **Step 3: Update memory/docs** — note in the repo README that the portfolio is Astro now (one paragraph: dev = `npm run dev`, build = `npm run build`, deploy = push to main).

---

## Self-review (done at planning time)

- **Spec coverage:** framework/static output (T1), pixel-faithful styles+sections (T2,4–9), splash dropped (T5 removes splashAnimation.json; no splash component), GA4 deferred (T2), build-time GitHub data + weekly cron (T9,T10), build-time logo colors (T7), islands only for toggle/lottie/scroll (T4,5,9), CSS entrance animations + reduced-motion (T5), SEO head/assets/redirects (T2, public/ kept, T11 §4), fonts display:swap with managed hashes (T2), deploy workflow (T10), 5-point verification gate (T11), cutover (T12). No gaps found.
- **Placeholder scan:** component tasks reference exact `git show main:<path>` sources plus full skeletons; two style blocks are marked "must contain ported SCSS before commit" with explicit task-failure note — intentional, sourced, not TBD. `as any` skeletons in T3 carry an explicit "must be removed before commit" requirement.
- **Type consistency:** `portfolio.ts` exports match consumers (`workExperiences` in T7, `openSourceCard`/`blogSection` in T8, `contactInfo`/`socialMediaLinks` in T9, `greeting`/`skillsSection`/`techStack` in T4–6). `fetchGithubProfile` returns `GithubProfile | null`, consumed accordingly in T9.
