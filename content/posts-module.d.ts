// Served by scripts/content/posts-plugin.ts, which both the site's and the Worker's Vite builds load.
declare module "virtual:content/posts" {
  export const posts: import("./posts.ts").ContentPost[];
}
