import { Context, Effect, Layer, Result } from "effect";

import type { ContactMessage } from "@murugappan/contracts/api/contact.ts";
import {
  MailService,
  type DeliveryFailed,
  type DeliveryNotConfigured
} from "#src/modules/mail/mail.service.ts";
import {
  ContactQuotaRepository,
  type ContactLimitReached,
  type ContactUsage,
  type QuotaUnavailable
} from "#src/modules/rate-limit/contact-quota.repository.ts";
import type { VisitorKey } from "#src/modules/rate-limit/visitor-key.ts";

export type ContactError =
  | DeliveryNotConfigured
  | ContactLimitReached
  | DeliveryFailed
  | QuotaUnavailable;

type Delivery = { client: VisitorKey; message: ContactMessage };

export class ContactService extends Context.Service<
  ContactService,
  {
    deliver(input: Delivery): Effect.Effect<ContactUsage, ContactError>;
    usage(client: VisitorKey): Effect.Effect<ContactUsage, QuotaUnavailable>;
  }
>()("@murugappan/api/ContactService") {
  static readonly layer = Layer.effect(
    ContactService,
    Effect.gen(function* () {
      const mail = yield* MailService;
      const quota = yield* ContactQuotaRepository;
      const sender = yield* Effect.result(mail.sender);
      return {
        deliver: Result.match(sender, {
          onFailure: notConfigured =>
            Effect.fn("ContactService.deliver")(function* () {
              return yield* notConfigured;
            }),
          onSuccess: send =>
            Effect.fn("ContactService.deliver")(function* ({ client, message }: Delivery) {
              const usage = yield* quota.take(client);
              yield* send(message);
              return usage;
            })
        }),
        usage: Effect.fn("ContactService.usage")(function* (client) {
          return yield* quota.usage(client);
        })
      };
    })
  );
}
