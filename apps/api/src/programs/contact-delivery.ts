import { Context, Data, Effect } from "effect";

import type { ContactMessage } from "@murugappan/contracts/api/contact.ts";
import { globalLimiter } from "#src/api/ratelimit.ts";
import { contactMailer, sendContactEmail } from "#src/email.ts";
import type { ContactSlot, ContactUsage } from "#src/rate-limiter.ts";

class DeliveryNotConfigured extends Data.TaggedError("DeliveryNotConfigured") {}

export class ContactLimitReached extends Data.TaggedError("ContactLimitReached")<{
  readonly scope: "client" | "global";
  readonly usage: ContactUsage;
}> {}

class DeliveryFailed extends Data.TaggedError("DeliveryFailed")<{
  readonly cause: unknown;
}> {}

export class QuotaUnavailable extends Data.TaggedError("QuotaUnavailable")<{
  readonly cause: unknown;
}> {}

export type ContactError =
  | DeliveryNotConfigured
  | ContactLimitReached
  | DeliveryFailed
  | QuotaUnavailable;

type Send = (message: ContactMessage) => Effect.Effect<void, DeliveryFailed>;

export class Mailer extends Context.Service<
  Mailer,
  {
    /** The only way to get a `Send`, so no program can send on a deployment that has no inbox. */
    readonly sender: Effect.Effect<Send, DeliveryNotConfigured>;
  }
>()("@murugappan/api/Mailer") {
  static fromEnv(env: Env): Mailer["Service"] {
    const mailer = contactMailer(env);
    if (!mailer) return { sender: Effect.fail(new DeliveryNotConfigured()) };
    const send: Send = message =>
      Effect.tryPromise({
        try: () => sendContactEmail({ ...mailer, msg: message }),
        catch: cause => new DeliveryFailed({ cause })
      });
    return { sender: Effect.succeed(send) };
  }
}

export class ContactQuota extends Context.Service<
  ContactQuota,
  {
    take(client: string): Effect.Effect<ContactUsage, ContactLimitReached | QuotaUnavailable>;
    usage(client: string): Effect.Effect<ContactUsage, QuotaUnavailable>;
  }
>()("@murugappan/api/ContactQuota") {
  static fromEnv(env: Env): ContactQuota["Service"] {
    return {
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
    };
  }
}

export const deliverContact = Effect.fn("deliverContact")(function* ({
  client,
  message
}: {
  client: string;
  message: ContactMessage;
}): Effect.fn.Return<ContactUsage, ContactError, Mailer | ContactQuota> {
  const send = yield* Mailer.use(mailer => mailer.sender);
  const usage = yield* ContactQuota.use(quota => quota.take(client));
  yield* send(message);
  return usage;
});

export const contactUsage = (client: string) => ContactQuota.use(quota => quota.usage(client));
