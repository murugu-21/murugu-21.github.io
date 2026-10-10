# Blog index

The blog index lists every post. A visitor narrows it with a search box and tag chips, and the filter is mirrored into the URL so a filtered view survives a reload and can be shared.

## Sub-features

- `blog-search` filters by title, tag or keyword and writes `?q=`.
- `blog-tags` filters by any selected tag and writes one `?tag=` per chip.
- `blog-url-load` restores search text and chips from the URL on load.

## How to get to it (user POV)

- Open `/blog/` and type in the search box (placeholder `Search by title or tag`).
- Tick tag chips under the search box.
- Open a shared `/blog/?q=…&tag=…` link.
- Choose a tag on a post page (`All posts tagged <tag>`), which links to `/blog/?tag=<tag>`.

## Driving it with chrome-devtools

Preconditions:

- `new_page url: "http://localhost:8791/blog/"` in this run's isolated context.
- `E="$RUN/evidence/blog-index"; mkdir -p "$E"`.

Steps:

- **`blog-search`.** `fill` the searchbox named `search article by tag or title` with `kafka`. The URL becomes `/blog/?q=kafka`, and the only visible post link is `Forms in, webhooks out: what I learned building an event-driven pipeline with Claude`. It matches on keywords, not its title.
- **`blog-url-load`.** `navigate_page url: "http://localhost:8791/blog/?tag=ai&tag=backend"`. The checkboxes `ai 3` and `backend 3` are checked, and five post links are visible, because selected tags combine with OR.
- **`blog-tags`.** `navigate_page url: "http://localhost:8791/blog/"`, re-snapshot, and `click` the `StaticText "system-design"` uid just under the `system-design 3` checkbox. The URL becomes `/blog/?tag=system-design` and three post links are visible.
- **`blog-url-load`.** From a post page, `navigate_page url: "http://localhost:8791/blog/sitegpt-partykit-durable-objects/"`, re-snapshot, and `click` the link named `All posts tagged system-design`. The URL becomes `/blog/?tag=system-design`, the `system-design 3` checkbox is checked, and three post links are visible.
- **Read the visible set.** `evaluate_script () => [...document.querySelectorAll('main a[href^="/blog/"]')].filter(a => a.offsetParent !== null).map(a => a.textContent.trim())` lists the visible titles.
- **Proof.** `take_snapshot filePath: "$E/blog-tags.aria.txt"` and `take_screenshot filePath: "$E/blog-tags.png"`. The snapshot's root line carries the filtered URL.

## Gotchas

- Each chip's checkbox is offscreen, so clicking the `checkbox` uid times out as not interactive. Click its label text, as a visitor does.
- Search text and tags combine with AND. Tags combine with each other with OR.
- Clearing the search box drops `?q=` from the URL. Unknown `?tag=` values are ignored.
- Chip counts come from the build. A new post needs a rebuild before it shows.
