import React, { useState } from "react"

import SearchBar from "../components/searchBar"
import TagBar from "../components/tagBar"

import Post from "./post"

const AllPosts = ({ data }) => {
  const [selectedTags, setSelectedTags] = useState([])
  const posts = React.useMemo(() => data.allMarkdownRemark.nodes, [data])

  const tags = React.useMemo(
    () =>
      Object.entries(
        posts.reduce((totals, post) => {
          return post.frontmatter?.tags?.reduce((tagTotals, tag) => {
            return { ...tagTotals, [tag]: (tagTotals[tag] || 0) + 1 }
          }, totals)
        }, {})
      )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => {
          if (a.count === b.count) return a.name > b.name ? 1 : -1
          return a.count < b.count ? 1 : -1
        })
        .map(tag => {
          return { ...tag, selected: false }
        }),
    [posts]
  )

  const [searchQuery, setSearchQuery] = useState("")
  const query = searchQuery.toLowerCase()
  const filteredPosts = posts.filter(post => {
    return (
      (post.frontmatter?.title?.toLowerCase().includes(query) ||
        post.frontmatter?.description?.toLowerCase().includes(query) ||
        (typeof post.frontmatter?.description === "undefined" &&
          post.excerpt?.toLowerCase().includes(query))) &&
      (selectedTags.length === 0 ||
        post.frontmatter.tags.some(tag => selectedTags.includes(tag)))
    )
  })

  const handleTagSelect = React.useCallback(({ target }) => {
    setSelectedTags(prevTags => {
      if (prevTags.includes(target.value)) {
        return prevTags.filter(tag => target.value !== tag)
      } else {
        return [...prevTags, target.value]
      }
    })
  }, [])

  return (
    <>
      <SearchBar
        query={searchQuery}
        onChange={React.useCallback(e => setSearchQuery(e.target.value), [])}
      />
      <TagBar
        tags={tags}
        onTagSelect={handleTagSelect}
        selectedTags={selectedTags}
      />
      <ol style={{ listStyle: `none` }}>
        {filteredPosts.map(post => {
          return <Post post={post} key={post.fields.slug} />
        })}
      </ol>
      {filteredPosts.length === 0 && (
        <p className="post-list-item h2">No matching article found</p>
      )}
    </>
  )
}

export default AllPosts
