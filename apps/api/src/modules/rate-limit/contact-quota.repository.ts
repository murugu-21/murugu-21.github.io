import { Context, Data, Effect, Layer } from "effect";

import { WorkerEnv } from "#src/common/di/worker-env.ts";
import { globalLimiter } from "#src/modules/rate-limit/rate-limiter.client.ts";

/** What is left of each contact tier today, after the reporting call. */
export type ContactUsage = { clientRemaining: number; globalRemaining: number };

export type ContactSlot = ContactUsage &
  ({ allowed: true } | { allowed: false; scope: "client" | "global" });

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
      take: Effect.fn("ContactQuotaRepository.take")(function* (client) {
        const slot = yield* Effect.tryPromise<ContactSlot, QuotaUnavailable>({
          try: () => globalLimiter(env).takeContactSlot(client),
          catch: cause => new QuotaUnavailable({ cause })
        });
        if (!slot.allowed) {
          return yield* new ContactLimitReached({ scope: slot.scope, usage: slot });
        }
        return slot;
      }),
      usage: Effect.fn("ContactQuotaRepository.usage")(function* (client) {
        return yield* Effect.tryPromise({
          try: () => globalLimiter(env).contactUsage(client),
          catch: cause => new QuotaUnavailable({ cause })
        });
      })
    }))
  );
}
