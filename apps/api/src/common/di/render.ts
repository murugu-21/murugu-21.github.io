export type Tagged = { readonly _tag: string };

/**
 * One handler per tag. A missing or unknown tag is a compile error at the table. A plain `string`
 * tag would make the table an index signature that accepts anything, so it resolves to `never`.
 */
type Failures<E extends Tagged, Out> = string extends E["_tag"]
  ? never
  : { readonly [K in E["_tag"]]: (error: E & { readonly _tag: K }) => Out };

/** How a controller turns a service's success and each of its tagged failures into its answer. */
export type Render<A, E extends Tagged, Out> = {
  readonly success: (value: A) => Out;
  readonly failures: Failures<E, Out>;
};

export function renderFailure<E extends Tagged, Out>(failures: Failures<E, Out>, error: E): Out {
  const tag: E["_tag"] = error._tag;
  return failures[tag](error);
}
