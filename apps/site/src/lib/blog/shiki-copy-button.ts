import type { Element } from "hast";
import type { ShikiTransformer } from "shiki";

export const COPY_LABEL = "Copy code";

// The fence's margins beat prose's 2em figure ones (none after a heading or rule) because
// variants sort after `.prose`. The pre's right padding keeps code clear of the button.
const figureClasses = "group relative in-[.prose]:my-6 [:is(hr,h2,h3,h4)+&]:mt-0 [&>pre]:pr-12";

// Hover devices see it on hover or focus, touch devices always. It needs JS, so it hides
// without scripting.
const buttonClasses =
  "absolute top-2 right-2 cursor-pointer rounded-md border border-border-soft bg-surface p-1.5 text-subtitle opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-navy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current data-copied:opacity-100 motion-reduce:transition-none dark:border-fence-edge-dark dark:bg-dark-base dark:text-text-dark dark:hover:text-blue-light print:hidden noscript:hidden [@media(hover:none)]:opacity-100";

const copyIconClasses = "size-4 in-data-copied:hidden";
const checkIconClasses = "hidden size-4 in-data-copied:block";

const element = ({
  tagName,
  properties,
  children = []
}: Pick<Element, "tagName" | "properties"> & { children?: Element[] }): Element => ({
  type: "element",
  tagName,
  properties,
  children
});

// Lucide's `copy` and `check` (ISC), inlined because Icon.astro's sprite URL is hashed at build.
const icon = ({ className, shapes }: { className: string; shapes: Element[] }) =>
  element({
    tagName: "svg",
    properties: {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ariaHidden: "true",
      className: [className]
    },
    children: shapes
  });

const copyButtonNode = () =>
  element({
    tagName: "button",
    properties: {
      type: "button",
      dataCopyCode: "",
      ariaLabel: COPY_LABEL,
      className: [buttonClasses]
    },
    children: [
      icon({
        className: copyIconClasses,
        shapes: [
          element({
            tagName: "rect",
            properties: { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }
          }),
          element({
            tagName: "path",
            properties: { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }
          })
        ]
      }),
      icon({
        className: checkIconClasses,
        shapes: [element({ tagName: "path", properties: { d: "M20 6 9 17l-5-5" } })]
      })
    ]
  });

/**
 * Wraps each fence in a figure beside a copy button, outside `<pre>` so it doesn't scroll away.
 * A figure because read-aloud (packages/content/speech.ts) skips figures but reads divs.
 */
export const copyButton: ShikiTransformer = {
  name: "copy-button",
  root(root) {
    const [pre] = root.children;
    if (pre?.type !== "element") return;
    root.children = [
      element({
        tagName: "figure",
        properties: { dataCodeBlock: "", className: [figureClasses] },
        children: [pre, copyButtonNode()]
      })
    ];
  }
};
