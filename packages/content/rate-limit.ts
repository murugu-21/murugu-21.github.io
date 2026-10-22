import type { Quota } from "@murugappan/contracts/api/quotas.ts";

export type Reported = { quota: Quota; remaining: number; resetSeconds: number };

export function rateLimitField({ quota, remaining, resetSeconds }: Reported): string {
  return `"${quota.name}";r=${remaining};t=${resetSeconds}`;
}
