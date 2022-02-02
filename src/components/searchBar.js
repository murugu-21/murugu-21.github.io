import React from "react"
import "./search.css"

const SEARCH_STYLE = {
  width: "100%",
  padding: ".25em .5em",
  fontSize: "1.25rem",
  borderRadius: "0.5rem",
  border: "0.1rem solid var(--color-primary)",
  backgroundColor: "var(--color-background)",
  color: "var(--color-text)"
}

export default function SearchBar({ query, onChange }) {
  return (
    <input
      id="search"
      type="search"
      aria-label="search article by tag or title"
      className="search"
      style={SEARCH_STYLE}
      value={query}
      onInput={onChange}
    />
  )
}
