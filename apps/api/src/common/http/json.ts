import { READ_CACHE_MINUTES } from "@murugappan/contracts/api/quotas.ts";
import type { JsonRecord } from "@murugappan/utils/json.ts";

const READ_CACHE = `public, max-age=${READ_CACHE_MINUTES * 60}`;

export function json(data: JsonRecord): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": READ_CACHE
    }
  });
}
