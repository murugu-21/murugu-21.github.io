// `astro:content` in the node tests. A test fills the collection with setPosts.
import type { CollectionEntry, CollectionKey } from "astro:content";

export { defineCollection } from "astro/content/config";

let entries: CollectionEntry<CollectionKey>[] = [];

export function setPosts(posts: CollectionEntry<CollectionKey>[]): void {
  entries = posts;
}

export async function getCollection(
  _collection: CollectionKey,
  filter?: (entry: CollectionEntry<CollectionKey>) => boolean
): Promise<CollectionEntry<CollectionKey>[]> {
  return filter ? entries.filter(filter) : [...entries];
}
