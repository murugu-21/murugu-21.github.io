import type { Element } from "hast";
import type { Options } from "rehype-autolink-headings";

// An <a> with a link icon prepended inside each heading.
// It sits in the gutter left of the heading, and the icon shows while the
// heading is hovered (hover-capable pointers only) or the anchor focused, which
// a tap does. Its colour is the prose link colour.
const linkIcon: Element = {
  type: "element",
  tagName: "svg",
  properties: {
    className: ["invisible", "group-hover/heading:visible", "in-focus:visible"],
    ariaHidden: "true",
    focusable: "false",
    height: 16,
    width: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5"
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        d: "M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z",
        fill: "currentColor"
      },
      children: []
    }
  ]
};

export const autolinkConfig: Options = {
  behavior: "prepend",
  headingProperties: { className: ["group/heading", "relative"] },
  properties: {
    className: [
      "absolute",
      "top-1/2",
      "left-0",
      "-translate-x-full",
      "-translate-y-1/2",
      "pr-1",
      "leading-none"
    ],
    ariaHidden: "true",
    tabIndex: -1
  },
  content: linkIcon
};
