export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";
export const SLUG = new RegExp(SLUG_PATTERN);
export type PostSlug = string & { readonly __brand: "PostSlug" };
