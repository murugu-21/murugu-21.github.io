export function globalLimiter(env: Env) {
  return env.RateLimiter.get(env.RateLimiter.idFromName("global"));
}
