import "../styles/tag.css";
import React from "react";

export interface TagCount {
  name: string;
  count: number;
}

const TAG_STYLES: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  borderRadius: ".25em",
  marginRight: ".75em",
  marginTop: ".875em"
};

const TAG_NAME_STYLES: React.CSSProperties = {
  padding: `0 .5em`,
  borderRight: "none",
  border: "1px solid var(--color-text)",
  borderRadius: ".25em 0 0 .25em"
};

const TAG_COUNT_STYLES: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  fontSize: ".8em",
  backgroundColor: "var(--color-accent)",
  color: "white",
  borderRadius: "0 .25em .25em 0",
  padding: "0 .5em",
  alignSelf: "stretch"
};

const INPUT_STYLES: React.CSSProperties = {
  opacity: 0,
  position: "absolute",
  left: "-99999px"
};

interface TagProps {
  tag: TagCount;
  onTagSelect: React.ChangeEventHandler<HTMLInputElement>;
  isSelected: boolean;
}

const Tag = ({ tag, onTagSelect, isSelected }: TagProps) => {
  return (
    <>
      <input
        style={INPUT_STYLES}
        type="checkbox"
        checked={isSelected}
        onChange={onTagSelect}
        className="tag"
        id={`tag-${tag.name}`}
        value={tag.name}
      />
      <label htmlFor={`tag-${tag.name}`} style={TAG_STYLES}>
        <span style={TAG_NAME_STYLES}>{tag.name}</span>
        <div style={TAG_COUNT_STYLES}>{tag.count}</div>
      </label>
    </>
  );
};

export default React.memo(Tag);
