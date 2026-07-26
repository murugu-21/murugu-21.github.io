# Reference-Look Migration: soumyajit4419/Portfolio visual language

**Date:** 2026-07-27
**Status:** Approved (user chose: single page, restyle in place, keep both themes, keep fonts)

## Goal

Restyle murugappan.dev to the visual language of
[soumyajit4419/Portfolio](https://github.com/soumyajit4419/Portfolio) while
keeping the existing single-page structure, section order, content
(`src/data/portfolio.ts`), green palette, Montserrat/Agustina fonts, and the
light/dark toggle shared with the blog.

## Decisions

| Decision  | Choice                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Structure | Single page (no new routes); reference styling only                                                                         |
| Effects   | Typewriter hero + wave emoji, canvas particle starfield, tilt avatar, glow cards. **No preloader.**                         |
| Themes    | Keep both. Dark = faithful reference look (green-tinted); light = adapted equivalent                                        |
| Fonts     | Keep Montserrat + Agustina (no PT Mono)                                                                                     |
| Additions | Tech chip grid, "Find Me On" social circles, Download CV button (`public/resume.pdf`). **No GitHub contribution calendar.** |
| Approach  | Restyle in place — existing component tree and data untouched; SCSS + small markup tweaks; vanilla islands only (no React)  |
| Delivery  | All work on `feat/reference-portfolio-look`; user reviews visually before anything merges to `main`/prod                    |

## Design

### 1. Theme layer (`src/styles/_variables.scss`, `global.scss`)

- Dark mode: green-tinted dark gradient body background (reference uses
  `linear-gradient(to left, rgb(27,20,41), rgb(20,15,35))`; ours derives from
  `#282c35` with a green cast) plus its subtle bottom-left section overlay
  gradient. Themed scrollbar (dark track, green rounded thumb).
- Light mode: white/very-light-green equivalent; cards use soft green-tinted
  shadows instead of glows.
- New: `glow-card` mixin (transparent bg + green glow shadow, hover
  `scale(1.02)` + glow intensify in dark; solid surface + soft shadow in
  light), chip outline tokens, `.accent` class for inline green highlights.
  All section headings adopt the reference's "word-in-accent" pattern
  ("My Recent **Works**").

### 2. Navbar (`Header.astro`)

Fixed top; transparent at scrollY < 20, then translucent bg +
`backdrop-filter: blur` + soft shadow (dark: near-black translucent; light:
white translucent). Nav links: icon + label with a grow-in green underline on
hover (`::after` width 0 → 100%). Mobile: three green hamburger bars that
morph into an X. ThemeToggle island stays.

### 3. Vanilla islands (all respect `prefers-reduced-motion`)

- **Typewriter.astro** — loops `typewriterRoles` (new array in
  `portfolio.ts`) with delete effect + blinking cursor; reduced-motion shows
  the first role statically.
- **Particles.astro** — ~2KB canvas starfield fixed behind content; ~100 tiny
  dots drifting slowly, opacity pulsing; theme-aware color; idle-loaded
  (requestIdleCallback) so it cannot affect LCP; pauses when tab hidden;
  disabled under reduced-motion.
- **Tilt** — small pointer-driven 3D tilt on the Skills-section illustration.

### 4. Section restyles (order/content unchanged)

- **Greeting → hero:** "Hi There! 👋" with CSS wave keyframe (±14°, 2.1s
  infinite), name with green highlight, typewriter line below, green
  **Download CV** button → `/resume.pdf`. Lottie illustration stays right
  with existing eager/LCP preload handling.
- **Skills:** "Let me **introduce** myself" heading, intro text with green
  inline highlights, tech chip grid (rounded-rectangle outline chips with
  logo + label, 6 per row desktop / 3 mobile, hover `scale(1.05)` + brighter
  outline), tilt on illustration.
- **Proficiency, Education, WorkExperience, Projects, OpenSource, Blogs,
  GithubCard:** keep structure; apply glow-card style + accent headings.
  Project cards adopt reference anatomy: padded screenshot, title,
  description, GitHub/Demo icon buttons; hover scale + glow intensify.
- **New FindMeOn.astro** before footer: "Find Me On" heading, row of
  circular social buttons (existing `socialMediaLinks`), glow-on-hover
  circle-scale effect.
- **Footer:** slim three-column strip (credit / copyright / social icons);
  near-black in dark mode, adapted for light; columns stack on mobile.

### 5. Guardrails

- `portfolio.ts` gains only `typewriterRoles`; no other data changes.
- No new runtime dependencies; islands are hand-written vanilla TS.
- Contrast checked in both modes; all animations gated on
  `prefers-reduced-motion`.
- Verification: prettier, `astro check`, full `build:site`, Chrome DevTools
  screenshots (dark+light × desktop+mobile), Lighthouse spot-check to stay
  ~95+ mobile perf.

## Out of scope

Multi-page routes, preloader, GitHub contribution calendar, font changes,
blog app changes, content rewrites.
