import React from "react";

import { formatReadingTime } from "../utils/helpers";

// The serialized shape built in index.astro (the page's content-collection
// entry, flattened so it can cross the island boundary as JSON).
export interface SerializedPost {
  href: string;
  title: string;
  dateFormatted: string;
  minutes: number;
  tags: string[];
  description?: string;
  excerpt: string;
}

const Post = ({ post }: { post: SerializedPost }) => {
  const title = post.title;

  return (
    // The old `ol li { padding-left: 0; margin-bottom: calc(2rem / 2) }`.
    <li className="mb-4 pl-0">
      {/* `.post-list-item { margin-top: 2rem; margin-bottom: 2rem }`, but the
          article is the li's only child so the old `li *:last-child
          { margin-bottom: 0 }` (0,1,1) beat the class (0,1,0) — only the top
          margin survived. */}
      <article className="post-list-item mt-8" itemScope itemType="http://schema.org/Article">
        {/* `.post-list-item header { margin-bottom: 1rem }` */}
        <header className="mb-4">
          {/* `h1..h6` (line-height 1.1, letter-spacing -0.025em, font-weight
              bold) narrowed by `.post-list-item h2` (1.728rem = --fontSize-4,
              --color-primary, margin 0 0 0.5rem). */}
          <h2 className="mt-0 mb-2 text-[1.728rem] leading-[1.1] font-bold tracking-tight text-navy dark:text-blue-light">
            {/* `h2 > a { text-decoration: none; color: inherit }` */}
            <a href={post.href} itemProp="url" className="text-inherit no-underline">
              <span itemProp="headline">{title}</span>
            </a>
          </h2>
          {/* The old normalize.css `small { font-size: 80% }` needs no port:
              Tailwind v4's preflight ships the same rule. */}
          <small>
            {post.dateFormatted}
            {` • ${formatReadingTime(post.minutes)}`}{" "}
          </small>
          {/* Was an inline style object. `flex-wrap` is the ONE deliberate
              visual deviation of the Tailwind v4 migration: this un-wrapped
              row was the source of the blog index's pre-existing horizontal
              overflow at phone width (the document measured 490px wide at a
              390px viewport). With it the chips wrap onto a second line and
              `document.documentElement.scrollWidth === 390`. Nothing changes
              at desktop width, where the chips already fit on one line. */}
          <div className="flex flex-row flex-wrap gap-[10px]">
            {post.tags.map((tag, idx) => {
              return (
                // --fontSize-0 / --color-box, both gone with style.css.
                <div
                  className="border border-blue p-[2px] text-[0.833rem] dark:border-box-dark"
                  key={idx}
                >
                  {tag}
                </div>
              );
            })}
          </div>
        </header>
        <section>
          {/* `p { line-height: 1.625 }`; `.post-list-item p { margin-bottom: 0 }`
              (preflight already zeroes the margin). */}
          <p
            className="leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: post.description || post.excerpt
            }}
            itemProp="description"
          />
        </section>
      </article>
    </li>
  );
};

export default React.memo(Post);
