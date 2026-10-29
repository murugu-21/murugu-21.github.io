import { exports } from "cloudflare:workers";

export function globalLimiter() {
  return exports.RateLimiter.get(exports.RateLimiter.idFromName("global"));
}
