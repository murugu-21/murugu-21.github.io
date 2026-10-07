// Validation for POST /api/contact, the HTTP twin of Jarvis's capture_opportunity tool. Every
// rejection names its fields so a function-calling model can repair its arguments and retry.

import { z } from "zod";

import { text } from "./fields";

// Daily allowances enforced by the RateLimiter DO; small on purpose so this is not a mailer.
export const CONTACT_DAILY_GLOBAL = 20;
export const CONTACT_DAILY_PER_CLIENT = 3;

export const CONTACT_LIMITS = {
  name: 120,
  email: 254,
  company: 120,
  message: { min: 20, max: 4000 }
} as const;

export type ContactMessage = {
  name?: string;
  email: string;
  company?: string;
  message: string;
};

// Deliberately loose: stricter patterns reject deliverable addresses.
export const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

// Blank after trimming counts as absent.
const optionalText = ({ max, description }: { max: number; description: string }) =>
  z
    .string({ error: "must be a string" })
    .trim()
    .max(max, { error: `must be at most ${max} characters` })
    .nullish()
    .transform(value => value || undefined)
    .meta({ description });

const requiredText = z.string({ error: "is required and must be a string" }).trim();

const INVALID_EMAIL = { error: "must be a valid email address" };
const MESSAGE = CONTACT_LIMITS.message;
const MESSAGE_LENGTH = { error: `must be between ${MESSAGE.min} and ${MESSAGE.max} characters` };

// Key order is the order issues are reported in. Its shape is also send_message's input.
export const ContactRequest = z
  .object(
    {
      name: optionalText({ max: CONTACT_LIMITS.name, description: "Who the message is from." }),
      email: requiredText
        // abort: one issue per field, even when the address is both too long and malformed
        .max(CONTACT_LIMITS.email, { ...INVALID_EMAIL, abort: true })
        .regex(EMAIL, INVALID_EMAIL)
        .meta({
          description:
            "Reply-to address. Murugappan answers here, so it must be an address the sender reads.",
          format: "email"
        }),
      company: optionalText({
        max: CONTACT_LIMITS.company,
        description: "The company or team you are writing for."
      }),
      // default() publishes the default in the schema; the transform also maps null to it.
      dryRun: z
        .boolean({ error: "must be a boolean" })
        .nullish()
        .default(false)
        .transform(value => value ?? false)
        .meta({
          description:
            "Set true to validate the request without sending anything and without spending the allowance. The reply's status is then `validated` instead of `accepted`."
        }),
      message: requiredText.min(MESSAGE.min, MESSAGE_LENGTH).max(MESSAGE.max, MESSAGE_LENGTH).meta({
        description:
          "What you are writing about. Be specific: the role or project, the stack, and anything that needs a decision."
      })
    },
    { error: "must be a JSON object" }
  )
  .meta({ title: "ContactRequest", description: "Request body of sendContactMessage." });

export const ContactAccepted = z
  .object({
    status: z.enum(["accepted", "validated"]).meta({
      description:
        "`accepted` when the message was queued for delivery, `validated` when the request was a dry run."
    }),
    message: text("Human-readable confirmation.")
  })
  .meta({
    title: "ContactAccepted",
    description: "Response body of a successful sendContactMessage."
  });
