// subset-font ships no typings; this declares only the options the scripts use.
declare module "subset-font" {
  export interface SubsetFontOptions {
    targetFormat?: "sfnt" | "woff" | "woff2";
    preserveNameIds?: number[];
    keepFeatures?: string[];
    variationAxes?: Record<string, number | { min: number; max: number }>;
  }
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: SubsetFontOptions
  ): Promise<Buffer>;
}
