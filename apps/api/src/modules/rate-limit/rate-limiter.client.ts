/** The one RateLimiter DO every caller shares, so allowances and the chat balance are global. */
export function globalLimiter(env: Env) {
  return env.RateLimiter.get(env.RateLimiter.idFromName("global"));
}
