import { Context, Effect } from "effect";

import { ContactQuota, Mailer } from "#src/programs/contact-delivery.ts";

type RequestServices = Mailer | ContactQuota;

// Built from the request's env on every call, because workerd ties a binding's I/O to the request.
function requestServices(env: Env): Context.Context<RequestServices> {
  return Context.make(Mailer, Mailer.fromEnv(env)).pipe(
    Context.add(ContactQuota, ContactQuota.fromEnv(env))
  );
}

type Tagged = { readonly _tag: string };

/**
 * One handler per tag. A missing or unknown tag is a compile error at the table. A plain `string`
 * tag would make the table an index signature that accepts anything, so it resolves to `never`.
 */
type Failures<E extends Tagged, Out> = string extends E["_tag"]
  ? never
  : { readonly [K in E["_tag"]]: (error: E & { readonly _tag: K }) => Out };

export type Render<A, E extends Tagged, Out> = {
  readonly success: (value: A) => Out;
  readonly failures: Failures<E, Out>;
};

function dispatch<E extends Tagged, Out>(failures: Failures<E, Out>, error: E): Out {
  const tag: E["_tag"] = error._tag;
  return failures[tag](error);
}

export function runInRequest<A, E extends Tagged, Out>({
  env,
  program,
  render
}: {
  env: Env;
  program: Effect.Effect<A, E, RequestServices>;
  render: Render<NoInfer<A>, NoInfer<E>, Out>;
}): Promise<Out> {
  const { success, failures } = render;
  return Effect.runPromise(
    program.pipe(
      Effect.matchEffect({
        onSuccess: value => Effect.sync(() => success(value)),
        onFailure: error => Effect.sync(() => dispatch(failures, error))
      }),
      Effect.provideContext(requestServices(env))
    )
  );
}
