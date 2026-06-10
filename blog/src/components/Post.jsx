import React from "react"

import { formatReadingTime } from "../utils/helpers"

// `post` is the serialized shape built in index.astro:
// { href, title, dateFormatted, minutes, tags, description?, excerpt }
const Post = ({ post }) => {
  const title = post.title

  return (
    <li>
      <article
        className="post-list-item"
        itemScope
        itemType="http://schema.org/Article"
      >
        <header>
          <h2>
            <a href={post.href} itemProp="url">
              <span itemProp="headline">{title}</span>
            </a>
          </h2>
          <small>
            {post.dateFormatted}
            {` • ${formatReadingTime(post.minutes)}`}{" "}
          </small>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "10px",
            }}
          >
            {post.tags.map((tag, idx) => {
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
              __html: post.description || post.excerpt,
            }}
            itemProp="description"
          />
        </section>
      </article>
    </li>
  )
}

export default React.memo(Post)
