# Brand images

X (Twitter) profile banners rendered from `x-cover.html`: the night sky and the
blue-hour sky, in the site's own tokens.

| File                   | Size      | Use                                     |
| ---------------------- | --------- | --------------------------------------- |
| `x-cover-dark.png`     | 1500×500  | night sky, X's recommended banner size  |
| `x-cover-light.png`    | 1500×500  | blue-hour sky (the light theme)         |
| `x-cover-dark@2x.png`  | 3000×1000 | same two banners, 2x for retina screens |
| `x-cover-light@2x.png` | 3000×1000 |                                         |

Regenerate after editing the source:

```sh
bun apps/site/brand/render-x-cover.ts
```

`x-cover.html` is one self-contained page. It renders the night sky by default
and blue hour with `?theme=light`. Every colour is a token from
`apps/site/src/styles/global.css`, and the type is the full Fira Code 6.2 variable font
the site's subset is cut from. The lockup mirrors the header (`<Murugappan M />`, muted
brackets); the tagline and subline mirror the OG image's.

X overlays the profile photo on the banner's bottom-left corner (≈200×110 in
the 1500×500 frame), so keep text out of it. The lockup sits left-aligned above
that corner, with the domain in the bottom-right.
