export type Tagged = { readonly _tag: string };

type HasLiteralTags<E extends Tagged> = string extends E["_tag"] ? false : true;

type Failures<E extends Tagged, Out> =
  HasLiteralTags<E> extends true
    ? { readonly [K in E["_tag"]]: (error: E & { readonly _tag: K }) => Out }
    : never;

export type Render<A, E extends Tagged, Out> = {
  readonly success: (value: A) => Out;
  readonly failures: Failures<E, Out>;
};

export function renderFailure<E extends Tagged, Out>(failures: Failures<E, Out>, error: E): Out {
  const tag: E["_tag"] = error._tag;
  return failures[tag](error);
}
