import React from "react";

import { Link } from "gatsby"

import { formatReadingTime } from "../utils/helpers"

const Post = ({ post }) => {
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
}
 
export default React.memo(Post);