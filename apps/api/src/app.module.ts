// The Effect dependency graph: every service and repository a controller can reach, and what each
// is wired to. Controllers run a program against it with `runInRequest`.

import { Effect, Layer } from "effect";

import { renderFailure, type Render, type Tagged } from "#src/common/di/render.ts";
import { WorkerEnv } from "#src/common/di/worker-env.ts";
import { AudioRepository } from "#src/modules/audio/audio.repository.ts";
import { AudioService } from "#src/modules/audio/audio.service.ts";
import { ContactService } from "#src/modules/contact/contact.service.ts";
import { MailService } from "#src/modules/mail/mail.service.ts";
import { PostsRepository } from "#src/modules/posts/posts.repository.ts";
import { PostsService } from "#src/modules/posts/posts.service.ts";
import { ProfileRepository } from "#src/modules/profile/profile.repository.ts";
import { ProfileService } from "#src/modules/profile/profile.service.ts";
import { ContactQuotaRepository } from "#src/modules/rate-limit/contact-quota.repository.ts";

const serviceLayers = Layer.mergeAll(
  AudioService.layer,
  ContactService.layer,
  PostsService.layer,
  ProfileService.layer
);

// Repositories, plus MailService, an integration service that ContactService depends on.
const providerLayers = Layer.mergeAll(
  AudioRepository.layer,
  ContactQuotaRepository.layer,
  MailService.layer,
  PostsRepository.layer,
  ProfileRepository.layer
);

type ProviderServices = Layer.Success<typeof providerLayers>;

/**
 * Every service, wired to its providers. A test passes fakes in `overrides`, as Nest's
 * `overrideProvider` does; a merge keeps the later layer's service for a tag.
 */
export function appLayer<R extends ProviderServices = never>(
  overrides?: Layer.Layer<R, never, WorkerEnv>
) {
  return serviceLayers.pipe(
    Layer.provideMerge(overrides ? Layer.merge(providerLayers, overrides) : providerLayers)
  );
}

export type AppLayer = ReturnType<typeof appLayer>;

type AppServices = Layer.Success<AppLayer>;

/** The services for one request, wired to its bindings. */
export type RequestServices = Layer.Layer<AppServices>;

// Per request, because workerd ties a binding's I/O to the request that made it.
export const forRequest = ({ layer, env }: { layer: AppLayer; env: Env }): RequestServices =>
  layer.pipe(Layer.provide(Layer.succeed(WorkerEnv, env)));

/** Runs a service program against the request's services and renders its outcome. */
export function runInRequest<A, E extends Tagged, Out>({
  services,
  program,
  render
}: {
  services: RequestServices;
  program: Effect.Effect<A, E, AppServices>;
  render: Render<NoInfer<A>, NoInfer<E>, Out>;
}): Promise<Out> {
  const { success, failures } = render;
  return Effect.runPromise(
    program.pipe(
      Effect.matchEffect({
        onSuccess: value => Effect.sync(() => success(value)),
        onFailure: error => Effect.sync(() => renderFailure(failures, error))
      }),
      Effect.provide(services)
    )
  );
}
