import { fromMarkdown } from "mdast-util-from-markdown";
import type { Nodes } from "mdast";

const isLocal = (url: string) => !URL.canParse(url);
const fileOf = (url: string) => new URL(url, "file:///post/").href;

const imagesLinkedToThemselves = (node: Nodes, linkUrl?: string): string[] => {
  if (node.type === "image") {
    return linkUrl !== undefined && isLocal(node.url) && fileOf(node.url) === fileOf(linkUrl)
      ? [node.url]
      : [];
  }
  const url = node.type === "link" ? node.url : linkUrl;
  return "children" in node
    ? node.children.flatMap(child => imagesLinkedToThemselves(child, url))
    : [];
};

export const findSelfLinkedImages = (markdown: string): string[] =>
  imagesLinkedToThemselves(fromMarkdown(markdown));
