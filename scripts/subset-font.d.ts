// subset-font ships no typings; only the surface render-mermaid.ts uses.
declare module "subset-font" {
  export interface SubsetFontOptions {
    targetFormat?: "sfnt" | "woff" | "woff2";
    preserveNameIds?: number[];
    variationAxes?: Record<string, number | { min: number; max: number }>;
  }
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetFontOptions
  ): Promise<Buffer>;
}
