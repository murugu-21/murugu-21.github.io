import type { JsonRecord } from "@murugappan/utils/json.ts";

// Reads depend only on the deployed build; five minutes keeps a redeploy visible quickly.
const READ_CACHE = "public, max-age=300";

/** A cacheable read: the API's JSON documents. */
export function json(data: JsonRecord): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": READ_CACHE
    }
  });
}
