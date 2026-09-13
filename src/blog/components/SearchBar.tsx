import React from "react";

interface SearchBarProps {
  query: string;
  onChange: React.FormEventHandler<HTMLInputElement>;
}

const SearchBar = ({ query, onChange }: SearchBarProps) => {
  return (
    // The inline style object's width/padding/font-size/radius plus the three
    // dangling vars (--color-primary / --color-background / --color-text).
    // `leading-[1.15]` restores normalize.css's `input { line-height: 1.15 }`,
    // which set the field's height; preflight's `font: inherit` would take the
    // body's 1.5 instead and make the box 7px taller.
    // search.css's `.search:focus { outline: none; border: 0.1rem solid
    // var(--color-box); box-shadow: 0 0 5px var(--color-box) }` — but the
    // border half of that rule never took effect: the old `border` lived in the
    // element's inline `style`, which outranks any stylesheet rule, so a focused
    // field kept its --color-primary border and only gained the glow. Hence no
    // `focus:border-*` here.
    <input
      id="search"
      type="search"
      aria-label="search article by tag or title"
      placeholder="Search by title or tag"
      // Island surface in both themes (white / #282c35) so the field reads as a
      // control on the gradient canvas; focus adds a ring on top of the glow.
      className="search w-full rounded-lg border-[0.1rem] border-navy bg-white px-[.5em] py-[.25em] text-[1.25rem] leading-[1.15] text-text placeholder:text-subtitle focus:shadow-[0_0_5px_var(--color-blue)] focus:ring-2 focus:ring-blue/40 focus:outline-none dark:border-blue-light dark:bg-dark-bg dark:text-text-dark dark:placeholder:text-accent-grey-dark dark:focus:shadow-[0_0_5px_var(--color-box-dark)] dark:focus:ring-box-dark/50"
      value={query}
      onInput={onChange}
    />
  );
};

export default React.memo(SearchBar);
