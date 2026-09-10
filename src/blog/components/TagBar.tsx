import Tag, { type TagCount } from "./Tag";
import React from "react";

const WRAPPER_STYLES: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap"
};

interface TagBarProps {
  tags: TagCount[];
  onTagSelect: React.ChangeEventHandler<HTMLInputElement>;
  selectedTags: string[];
}

const TagBar = ({ tags, onTagSelect, selectedTags }: TagBarProps) => {
  return (
    <div style={WRAPPER_STYLES}>
      {tags.map(tag => {
        return (
          <Tag
            key={tag.name}
            tag={tag}
            onTagSelect={onTagSelect}
            isSelected={selectedTags.includes(tag.name)}
          />
        );
      })}
    </div>
  );
};

export default TagBar;
