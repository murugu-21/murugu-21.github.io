import React from "react";

export interface TagCount {
  name: string;
  count: number;
}

interface TagProps {
  tag: TagCount;
  onTagSelect: React.ChangeEventHandler<HTMLInputElement>;
  isSelected: boolean;
}

// The port of tag.css's four `.tag + label` rules, split by concern. Written as
// arbitrary `[.tag:…+&]:` variants rather than `peer-*` because Tailwind's
// `peer-*` compiles to the GENERAL sibling combinator `~`: every input and
// label is a sibling inside TagBar's flex row, so checking one tag would paint
// every LATER label blue. The old rules used the adjacent combinator `+`.
//
// The `:hover` half is LIVE, and was live in the old blog too: hovering a
// `<label>` forwards `:hover` to the control it labels, so `.tag:hover + label`
// matches while the pointer is over the label even though the checkbox itself
// is parked offscreen and can never be pointed at directly.
//
// The `:focus` half is INERT — `.tag:focus + label { border-radius: .25em }`
// sets the same radius the label already carries — but it is kept for 1:1
// parity with the old stylesheet.
const LABEL_CLASS = [
  // base: `.tag + label { cursor: pointer }` plus the label's own box
  "mt-[.875em] mr-[.75em] flex cursor-pointer items-center rounded-[.25em]",
  // `.tag:checked + label { background-color: var(--color-box); color: #fff }`
  "[.tag:checked+&]:bg-blue [.tag:checked+&]:text-white dark:[.tag:checked+&]:bg-box-dark",
  // `.tag:hover + label { outline: none; border-color/box-shadow: var(--color-box) }`
  "[.tag:hover+&]:border-blue [.tag:hover+&]:shadow-[0_0_10px_var(--color-blue)] [.tag:hover+&]:outline-none",
  "dark:[.tag:hover+&]:border-box-dark dark:[.tag:hover+&]:shadow-[0_0_10px_var(--color-box-dark)]",
  // `.tag:focus + label { border-radius: .25em }` — inert, kept for parity
  "[.tag:focus+&]:rounded-[0.25em]"
].join(" ");

const Tag = ({ tag, onTagSelect, isSelected }: TagProps) => {
  return (
    <>
      {/* The checkbox is visually hidden but focusable and still the label's
          styling source, so it keeps the old `opacity: 0; position: absolute;
          left: -99999px` exactly (not `sr-only`, whose 1px clip would change
          nothing visually but is a different box). */}
      <input
        className="tag absolute -left-[99999px] opacity-0"
        type="checkbox"
        checked={isSelected}
        onChange={onTagSelect}
        id={`tag-${tag.name}`}
        value={tag.name}
      />
      <label htmlFor={`tag-${tag.name}`} className={LABEL_CLASS}>
        {/* The old inline object set `borderRight: "none"` before the `border`
            shorthand, so React serialised the shorthand last and all four sides
            kept the 1px border. */}
        <span className="rounded-[.25em_0_0_.25em] border border-text px-[.5em] dark:border-text-dark">
          {tag.name}
        </span>
        <div className="flex items-center self-stretch rounded-[0_.25em_.25em_0] bg-accent-grey px-[.5em] text-[.8em] text-white dark:bg-accent-grey-dark">
          {tag.count}
        </div>
      </label>
    </>
  );
};

export default React.memo(Tag);
