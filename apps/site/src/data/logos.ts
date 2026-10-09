import type { ImageMetadata } from "astro";

import type { Logo } from "@murugappan/content/portfolio.ts";
import medme from "#src/assets/images/medmeLogo.png";
import hyperverge from "#src/assets/images/hypervergeLogo.png";
import samsung from "#src/assets/images/samsungLogo.png";
import kumaraguru from "#src/assets/images/kumaraguruLogo.png";

export const LOGOS: Record<Logo, ImageMetadata> = { medme, hyperverge, samsung, kumaraguru };
