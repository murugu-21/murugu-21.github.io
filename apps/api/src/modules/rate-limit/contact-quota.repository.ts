import { Context, Data, Effect, Layer } from "effect";

import { globalLimiter } from "#src/modules/rate-limit/rate-limiter.client.ts";
import type { VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";

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

export class ContactQuotaRepository extends Context.Service<
  ContactQuotaRepository,
  {
    take(client: VisitorKey): Effect.Effect<ContactUsage, ContactLimitReached | QuotaUnavailable>;
    usage(client: VisitorKey): Effect.Effect<ContactUsage, QuotaUnavailable>;
  }
>()("@murugappan/api/ContactQuotaRepository") {
  static readonly layer = Layer.succeed(ContactQuotaRepository, {
    // The type arguments merge the stub's union of promise types, which inference can't.
    take: Effect.fn("ContactQuotaRepository.take")(function* (client: VisitorKey) {
      const slot = yield* Effect.tryPromise<ContactSlot, QuotaUnavailable>({
        try: () => globalLimiter().takeContactSlot(client),
        catch: cause => new QuotaUnavailable({ cause })
      });
      if (!slot.allowed) {
        return yield* new ContactLimitReached({ scope: slot.scope, usage: slot });
      }
      return slot;
    }),
    usage: Effect.fn("ContactQuotaRepository.usage")(function* (client: VisitorKey) {
      return yield* Effect.tryPromise({
        try: () => globalLimiter().contactUsage(client),
        catch: cause => new QuotaUnavailable({ cause })
      });
    })
  });
}
