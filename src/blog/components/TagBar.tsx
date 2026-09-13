import Tag, { type TagCount } from "./Tag";
import React from "react";

interface TagBarProps {
  tags: TagCount[];
  onTagSelect: React.ChangeEventHandler<HTMLInputElement>;
  selectedTags: string[];
}

const TagBar = ({ tags, onTagSelect, selectedTags }: TagBarProps) => {
  return (
    // Was an inline `display: flex; flex-wrap: wrap` style object.
    <div className="flex flex-wrap">
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
