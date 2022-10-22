import React from "react"

import Link from "next/link"

import { formatReadingTime } from "../utils/helpers"

const Post = ({ post }) => {
  const title = post.frontmatter.title || post.fields.slug

  return (
    <li>
      <article
        className="post-list-item"
        itemScope
        itemType="http://schema.org/Article"
      >
        <header>
          <h2>
            <Link href={post.fields.slug} itemProp="url">
              <a>
                <span itemProp="headline">{title}</span>
              </a>
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
}

export default React.memo(Post)
