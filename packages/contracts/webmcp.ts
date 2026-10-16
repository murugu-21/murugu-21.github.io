/** The tools every page registers on `document.modelContext`, in registration order. */
export const WEBMCP_TOOL_NAMES = [
  "get_profile",
  "list_blog_posts",
  "get_blog_post",
  "navigate_to"
] as const;
export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];
