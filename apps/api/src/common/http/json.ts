import type { JsonRecord } from "@murugappan/utils/json.ts";

const READ_CACHE = "public, max-age=300";

export function json(data: JsonRecord): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": READ_CACHE
    }
  });
}
