import React, { useState } from "react"
import { Link } from "gatsby"

import SearchBar from "../components/searchBar"
import TagBar from "../components/tagBar"

import { formatReadingTime } from "../utils/helpers"

const AllPosts = ({ data }) => {
    const [selectedTags, setSelectedTags] = useState([])
    const posts = data.allMarkdownRemark.nodes
    
    const tags = Object.entries(
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
        return { ...tag, selected: selectedTags.includes(tag.name) }
        })
  
  const [searchQuery, setSearchQuery] = useState("")
  const filteredPosts = posts.filter(post => {
    return (
      (post.frontmatter?.title?.toLowerCase().includes(searchQuery) ||
        post.frontmatter?.description?.toLowerCase().includes(searchQuery) ||
        (typeof post.frontmatter?.description === 'undefined' && post.excerpt
          ?.toLowerCase()
          .includes(searchQuery))) &&
      (selectedTags.length === 0 ||
        post.frontmatter.tags.some(tag => selectedTags.includes(tag)))
    )
  })
  
  function handleTagSelect({ target }) {
    setSelectedTags(prevTags => {
      if (prevTags.includes(target.value)) {
        return prevTags.filter(tag => target.value !== tag)
      } else {
        return [...prevTags, target.value]
      }
    })
  }
    return (
      <>
        <SearchBar
          query={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <TagBar tags={tags} onTagSelect={handleTagSelect} />
        <ol style={{ listStyle: `none` }}>
          {filteredPosts.map(post => {
            const title = post.frontmatter.title || post.fields.slug
            
            return (
              <li key={post.fields.slug}>
                <article
                  className="post-list-item"
                  itemScope
                  itemType="http://schema.org/Article"
                >
                  <header>
                    <h2>
                      <Link to={post.fields.slug} itemProp="url">
                        <span itemProp="headline">{title}</span>
                      </Link>
                    </h2>
                    <small>
                      {post.frontmatter.date}
                      {` • ${formatReadingTime(post.timeToRead)}`}{" "}
                    </small>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        gap: "10px",
                      }}
                    >
                      {post.frontmatter.tags.map((tag, idx) => {
                        return (
                          <div
                            style={{
                              fontSize: "var(--fontSize-0)",
                              border: "1px solid var(--color-box)",
                              padding: "2px",
                            }}
                            key={idx}
                          >
                            {tag}
                          </div>
                        )
                      })}
                    </div>
                  </header>
                  <section>
                    <p
                      dangerouslySetInnerHTML={{
                        __html: post.frontmatter.description || post.excerpt,
                      }}
                      itemProp="description"
                    />
                  </section>
                </article>
              </li>
            )
          })}
        </ol>
        {filteredPosts.length === 0 && (
          <p className="post-list-item h2">No matching article found</p>
        )}
      </>
    )
}
 
export default AllPosts;