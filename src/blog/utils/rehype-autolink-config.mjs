// Reproduces gatsby-remark-autolink-headers: an <a class="anchor"> prepended
// inside each heading, carrying the GitHub-style link icon. style.css already
// targets `a.anchor svg[aria-hidden="true"]`.
const linkIcon = {
  type: "element",
  tagName: "svg",
  properties: {
    ariaHidden: "true",
    focusable: "false",
    height: 16,
    width: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        d: "M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z",
        fill: "currentColor",
      },
      children: [],
    },
  ],
}

export const autolinkConfig = {
  behavior: "prepend",
  properties: { class: "anchor", ariaHidden: "true", tabIndex: -1 },
  content: linkIcon,
}
