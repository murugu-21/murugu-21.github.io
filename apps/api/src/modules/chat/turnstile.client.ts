import type { Context } from "hono";
import { z } from "zod";

import { TURNSTILE_TOKEN_PARAM } from "@murugappan/contracts/chat.ts";
import type { AppEnv } from "#src/common/app-env.ts";

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const Siteverify = z.object({ success: z.boolean() });
const SITEVERIFY_TIMEOUT_MS = 5000;
// Cloudflare caps tokens at 2048 characters, so anything longer is forged.
const Token = z.string().min(1).max(2048);

/**
 * Asks Cloudflare whether the request's Turnstile token is valid. Fails closed: a missing token
 * or secret, or a siteverify error, counts as a failed challenge.
 */
export async function passesTurnstile(c: Context<AppEnv>): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET_KEY?.trim();
  const token = Token.safeParse(c.req.query(TURNSTILE_TOKEN_PARAM)).data;
  if (!secret || !token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) form.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS)
    });
    const verdict = Siteverify.safeParse(await res.json());
    return verdict.success && verdict.data.success;
  } catch (cause) {
    console.error({ event: "turnstile siteverify failed", err: cause });
    return false;
  }
}
