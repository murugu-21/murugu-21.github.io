// Build-time check of wrangler.jsonc's contact inbox, run by astro.config.ts;
// free of Worker globals so the site's tsconfig can type-check it.
import { z } from "zod";

import { EMAIL } from "./api/contact";

const WranglerContact = z.object({
  vars: z.object({
    OPPORTUNITY_INBOX: z.string().regex(EMAIL, { error: "must be a valid email address" })
  }),
  send_email: z.array(z.object({ name: z.string(), destination_address: z.string().optional() }))
});

/** What is wrong with wrangler.jsonc's contact inbox, or null when it is deployable. */
export function contactConfigProblem(config: unknown): string | null {
  const parsed = WranglerContact.safeParse(config);
  if (!parsed.success) return z.prettifyError(parsed.error);
  const inbox = parsed.data.vars.OPPORTUNITY_INBOX;
  const binding = parsed.data.send_email.find(b => b.name === "EMAIL");
  if (binding?.destination_address !== inbox) {
    return `send_email EMAIL must set destination_address to vars.OPPORTUNITY_INBOX (${inbox})`;
  }
  return null;
}
