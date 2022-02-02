import Tag from "./tag"
import React from "react"

const WRAPPER_STYLES = {
  display: "flex",
  flexWrap: "wrap",
}

const TagBar = ({ tags, onTagSelect, marginTop }) => {
  return (
    <div style={WRAPPER_STYLES}>
      {tags.map(tag => {
        return (
          <Tag
            marginTop={marginTop}
            key={tag.name}
            tag={tag}
            onTagSelect={onTagSelect}
          />
        )
      })}
    </div>
  )
}

export default React.memo(TagBar);