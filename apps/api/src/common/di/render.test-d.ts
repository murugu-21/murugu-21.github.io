import type { Render } from "#src/common/di/render.ts";

type NotFound = { readonly _tag: "NotFound"; readonly id: string };
type Gone = { readonly _tag: "Gone" };
type Untagged = { readonly _tag: string };

const success = (value: number) => String(value);

({
  success,
  failures: { NotFound: ({ id }) => `no ${id}`, Gone: () => "gone" }
}) satisfies Render<number, NotFound | Gone, string>;

({ success, failures: {} }) satisfies Render<number, never, string>;

({
  success,
  // @ts-expect-error A table without an entry for Gone.
  failures: { NotFound: () => "missing" }
}) satisfies Render<number, NotFound | Gone, string>;

({
  success,
  // @ts-expect-error An entry for a tag the program can't fail with.
  failures: { NotFound: () => "missing", Gone: () => "gone", Expired: () => "expired" }
}) satisfies Render<number, NotFound | Gone, string>;

({
  success,
  // @ts-expect-error A string tag admits no table, not even an empty one.
  failures: {}
}) satisfies Render<number, Untagged, string>;
