export type TokenBucket = { tokens: number; refilledAt: number };

type BucketPolicy = { capacity: number; msPerToken: number };

export const CHAT_BUCKET: BucketPolicy = { capacity: 10, msPerToken: 5 * 60 * 1000 };

export const CHAT_DAILY_GLOBAL = 400;

export type ChatAdmission =
  | { allowed: true }
  | { allowed: false; reason: "visitor" | "site" | "balance" };

type BucketTake = { taken: true; bucket: TokenBucket } | { taken: false };

export function takeToken({
  bucket,
  now,
  policy
}: {
  bucket: TokenBucket;
  now: number;
  policy: BucketPolicy;
}): BucketTake {
  const earned = (now - bucket.refilledAt) / policy.msPerToken;
  const tokens = Math.min(policy.capacity, bucket.tokens + earned);
  if (tokens < 1) return { taken: false };
  return { taken: true, bucket: { tokens: tokens - 1, refilledAt: now } };
}
