// Read-only blog audio from R2; the prefix must match AUDIO_PREFIX in
// scripts/tts/r2.ts. Supports Range because <audio> seeks with it.
import { Hono } from "hono";

import { serveAsset } from "./not-found";

const FILE = /^[a-z0-9-]+\.(mp3|json)$/;
const CACHE = "public, max-age=3600";
const TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  json: "application/json"
};

interface ByteRange {
  offset: number;
  length: number;
}

// Single-range "bytes=a-b" / "bytes=a-" / "bytes=-n". null when absent or
// malformed.
export function parseRange(
  header: string | null,
  size: number
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    const suffix = Math.min(Number(m[2]), size);
    return suffix === 0 ? "unsatisfiable" : { offset: size - suffix, length: suffix };
  }
  const start = Number(m[1]);
  if (start >= size) return "unsatisfiable";
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (end < start) return "unsatisfiable";
  return { offset: start, length: end - start + 1 };
}

export const audio = new Hono<{ Bindings: Env }>();

audio.get("/:file", async c => {
  const file = c.req.param("file");
  const extension = FILE.exec(file)?.[1];
  if (!extension) return serveAsset(c.req.raw, c.env.ASSETS);

  const key = `blog/breeze/${file}`;
  const head = await c.env.AUDIO.head(key);
  if (!head) return serveAsset(c.req.raw, c.env.ASSETS);

  const etag = head.httpEtag;
  const contentType = head.httpMetadata?.contentType ?? TYPES[extension];
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE,
    ETag: etag
  };

  if (c.req.header("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const range = parseRange(c.req.header("Range") ?? null, head.size);
  if (range === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${head.size}` }
    });
  }

  const object = await c.env.AUDIO.get(key, range ? { range } : undefined);
  if (!object) return serveAsset(c.req.raw, c.env.ASSETS);

  if (range) {
    const last = range.offset + range.length - 1;
    return new Response(object.body, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.offset}-${last}/${head.size}`,
        "Content-Length": String(range.length)
      }
    });
  }
  return new Response(object.body, {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(head.size) }
  });
});
