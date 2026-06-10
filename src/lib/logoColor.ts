import path from "node:path";
import sharp from "sharp";

// Source files for the experience-card logos, keyed by company name.
// Build-time only: sharp reads the original images from disk. Paths are
// resolved from the project root (where `astro build` runs) because the
// bundled module's import.meta.url moves under dist/ during the build.
const logoFiles: Record<string, string> = {
  "MedMe Health": "src/assets/images/medmeLogo.png",
  HyperVerge: "src/assets/images/hypervergeLogo.png",
  "Samsung R&D Institute India": "src/assets/images/samsungLogo.png"
};

const FALLBACK = "rgb(255, 255, 255)";

/** Average color of a company's logo as "rgb(r, g, b)"; white on unknown/failure. */
export async function bannerColor(company: string): Promise<string> {
  const file = logoFiles[company];
  if (!file) return FALLBACK;
  try {
    const {data} = await sharp(path.resolve(file))
      .resize(1, 1, {fit: "cover"})
      .raw()
      .toBuffer({resolveWithObject: true});
    return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
  } catch {
    return FALLBACK;
  }
}
