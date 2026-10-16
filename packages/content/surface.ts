import {
  DOCUMENTS,
  ENTRY_POINTS,
  LINKS,
  type Surface,
  type SurfaceDocument
} from "@murugappan/contracts/surface.ts";
import { SITE_ORIGIN } from "./site.ts";

export const linkedDocuments = (surface: Surface): readonly SurfaceDocument[] =>
  LINKS[surface].map(key => DOCUMENTS[key]);

/** One RFC 8288 link-value: `</llms.txt>; rel="describedby"; type="text/plain"` */
export const linkValue = ({ path, rel, type }: Omit<SurfaceDocument, "title">): string =>
  `<${path}>; rel="${rel}"${type ? `; type="${type}"` : ""}`;

/** RFC 8288 field value: the surface's link-values, comma-separated. */
export const linkHeader = (surface: Surface): string =>
  linkedDocuments(surface).map(linkValue).join(", ");

export const developersSection = (fragment: "versioning" | "mcp"): SurfaceDocument => ({
  ...DOCUMENTS.developers,
  path: `${DOCUMENTS.developers.path}#${fragment}`
});

export const entryPoints = (): string =>
  ENTRY_POINTS.map(key => {
    const { title, path } = DOCUMENTS[key];
    return `- [${title}](${SITE_ORIGIN}${path})`;
  }).join("\n");
