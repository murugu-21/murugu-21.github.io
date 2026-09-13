import React, { useState } from "react";

import SearchBar from "./SearchBar";
import TagBar from "./TagBar";
import type { TagCount } from "./Tag";

import Post, { type SerializedPost } from "./Post";

const AllPosts = ({ posts }: { posts: SerializedPost[] }) => {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const tags = React.useMemo<TagCount[]>(
    () =>
      Object.entries(
        posts.reduce<Record<string, number>>((totals, post) => {
          return post.tags.reduce((tagTotals, tag) => {
            return { ...tagTotals, [tag]: (tagTotals[tag] || 0) + 1 };
          }, totals);
        }, {})
      )
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => {
          if (a.count === b.count) return a.name > b.name ? 1 : -1;
          return a.count < b.count ? 1 : -1;
        }),
    [posts]
  );

  const [searchQuery, setSearchQuery] = useState("");
  const query = searchQuery.toLowerCase();
  const filteredPosts = posts.filter(post => {
    return (
      (post.title.toLowerCase().includes(query) ||
        post.description?.toLowerCase().includes(query) ||
        (typeof post.description === "undefined" && post.excerpt.toLowerCase().includes(query))) &&
      (selectedTags.length === 0 || post.tags.some(tag => selectedTags.includes(tag)))
    );
  });

  const handleTagSelect = React.useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    ({ target }) => {
      setSelectedTags(prevTags => {
        if (prevTags.includes(target.value)) {
          return prevTags.filter(tag => target.value !== tag);
        } else {
          return [...prevTags, target.value];
        }
      });
    },
    []
  );

  return (
    <>
      <SearchBar
        query={searchQuery}
        onChange={React.useCallback<React.FormEventHandler<HTMLInputElement>>(
          e => setSearchQuery(e.currentTarget.value),
          []
        )}
      />
      <TagBar tags={tags} onTagSelect={handleTagSelect} selectedTags={selectedTags} />
      {/* `ul, ol { margin: 1em 0 2rem; padding: 0; list-style: none }` — the
          2rem bottom came from style.css, the 1em top from the UA sheet. */}
      <ol className="mt-4 mb-8 list-none p-0">
        {filteredPosts.map(post => {
          return <Post post={post} key={post.href} />;
        })}
      </ol>
      {filteredPosts.length === 0 && (
        // `.post-list-item` margins (2rem top and bottom) beat the `p` rule's
        // `margin: 0 0 2rem`; `p` still supplies line-height 1.625.
        <p className="post-list-item h2 my-8 leading-relaxed">No matching article found</p>
      )}
    </>
  );
};

export default AllPosts;
