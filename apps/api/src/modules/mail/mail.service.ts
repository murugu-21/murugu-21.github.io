import { Context, Data, Effect, Layer } from "effect";

import type { ContactMessage } from "@murugappan/contracts/api/contact.ts";
import { WorkerEnv } from "#src/common/di/worker-env.ts";
import { contactMailer, sendContactEmail } from "#src/modules/mail/mail.client.ts";

export class DeliveryNotConfigured extends Data.TaggedError("DeliveryNotConfigured") {}

export class DeliveryFailed extends Data.TaggedError("DeliveryFailed")<{
  readonly cause: unknown;
}> {}

type Send = (message: ContactMessage) => Effect.Effect<void, DeliveryFailed>;

export class MailService extends Context.Service<
  MailService,
  {
    /** The only way to get a `Send`, so nothing can send on a deployment that has no inbox. */
    readonly sender: Effect.Effect<Send, DeliveryNotConfigured>;
  }
>()("@murugappan/api/MailService") {
  static readonly layer = Layer.effect(
    MailService,
    WorkerEnv.useSync(env => {
      const mailer = contactMailer(env);
      if (!mailer) return { sender: Effect.fail(new DeliveryNotConfigured()) };
      const send: Send = message =>
        Effect.tryPromise({
          try: () => sendContactEmail({ ...mailer, msg: message }),
          catch: cause => new DeliveryFailed({ cause })
        });
      return { sender: Effect.succeed(send) };
    })
  );
}
