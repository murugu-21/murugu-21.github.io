import { Context, Data, Effect, Layer } from "effect";

import { WorkerEnv } from "#src/common/di/worker-env.ts";
import { globalLimiter } from "#src/modules/rate-limit/rate-limiter.client.ts";
import type {
  ContactSlot,
  ContactUsage
} from "#src/modules/rate-limit/rate-limiter.durable-object.ts";

export class ContactLimitReached extends Data.TaggedError("ContactLimitReached")<{
  readonly scope: "client" | "global";
  readonly usage: ContactUsage;
}> {}

export class QuotaUnavailable extends Data.TaggedError("QuotaUnavailable")<{
  readonly cause: unknown;
}> {}

/** The daily contact allowance, counted in the shared RateLimiter Durable Object. */
export class ContactQuotaRepository extends Context.Service<
  ContactQuotaRepository,
  {
    take(client: string): Effect.Effect<ContactUsage, ContactLimitReached | QuotaUnavailable>;
    usage(client: string): Effect.Effect<ContactUsage, QuotaUnavailable>;
  }
>()("@murugappan/api/ContactQuotaRepository") {
  static readonly layer = Layer.effect(
    ContactQuotaRepository,
    WorkerEnv.useSync(env => ({
      // The type arguments merge the stub's union of promise types, which inference can't.
      take: client =>
        Effect.tryPromise<ContactSlot, QuotaUnavailable>({
          try: () => globalLimiter(env).takeContactSlot(client),
          catch: cause => new QuotaUnavailable({ cause })
        }).pipe(
          Effect.flatMap(slot =>
            slot.allowed
              ? Effect.succeed(slot)
              : Effect.fail(new ContactLimitReached({ scope: slot.scope, usage: slot }))
          )
        ),
      usage: client =>
        Effect.tryPromise({
          try: () => globalLimiter(env).contactUsage(client),
          catch: cause => new QuotaUnavailable({ cause })
        })
    }))
  );
}
