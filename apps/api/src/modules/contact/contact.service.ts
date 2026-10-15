import { Context, Effect, Layer } from "effect";

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

export type ContactError =
  | DeliveryNotConfigured
  | ContactLimitReached
  | DeliveryFailed
  | QuotaUnavailable;

/** Delivery for POST /api/contact and the MCP send_message tool, so both share one allowance. */
export class ContactService extends Context.Service<
  ContactService,
  {
    deliver(input: {
      client: string;
      message: ContactMessage;
    }): Effect.Effect<ContactUsage, ContactError>;
    usage(client: string): Effect.Effect<ContactUsage, QuotaUnavailable>;
  }
>()("@murugappan/api/ContactService") {
  static readonly layer = Layer.effect(
    ContactService,
    Effect.gen(function* () {
      const mail = yield* MailService;
      const quota = yield* ContactQuotaRepository;
      return {
        // The sender comes first so an unconfigured deployment never spends a slot.
        deliver: Effect.fn("ContactService.deliver")(function* ({ client, message }) {
          const send = yield* mail.sender;
          const usage = yield* quota.take(client);
          yield* send(message);
          return usage;
        }),
        usage: Effect.fn("ContactService.usage")(function* (client) {
          return yield* quota.usage(client);
        })
      };
    })
  );
}
