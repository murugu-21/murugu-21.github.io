import { Hono } from "hono";

import { runInRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import type { Render } from "#src/common/di/render.ts";
import { audioExtension } from "#src/modules/audio/audio-file.ts";
import type { AudioNotFound } from "#src/modules/audio/audio.repository.ts";
import { AudioService, type AudioMeta, type AudioReply } from "#src/modules/audio/audio.service.ts";
import { serveAsset } from "#src/modules/pages/assets.client.ts";

const CACHE = "public, max-age=3600";

const baseHeaders = ({ etag, contentType }: AudioMeta) => ({
  "Content-Type": contentType,
  "Accept-Ranges": "bytes",
  "Cache-Control": CACHE,
  ETag: etag
});

function audioResponse(reply: AudioReply): Response {
  const { meta } = reply;
  switch (reply.kind) {
    case "not-modified":
      return new Response(null, { status: 304, headers: baseHeaders(meta) });
    case "unsatisfiable":
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders(meta), "Content-Range": `bytes */${meta.size}` }
      });
    case "content": {
      const { range } = reply;
      if (!range) {
        return new Response(reply.body, {
          status: 200,
          headers: { ...baseHeaders(meta), "Content-Length": String(meta.size) }
        });
      }
      const last = range.offset + range.length - 1;
      return new Response(reply.body, {
        status: 206,
        headers: {
          ...baseHeaders(meta),
          "Content-Range": `bytes ${range.offset}-${last}/${meta.size}`,
          "Content-Length": String(range.length)
        }
      });
    }
  }
}

export const audioController = new Hono<AppEnv>();

audioController.get("/:file", async c => {
  const file = c.req.param("file");
  const extension = audioExtension(file);
  if (!extension) return serveAsset(c);

  const render: Render<AudioReply, AudioNotFound, Response | Promise<Response>> = {
    success: audioResponse,
    failures: { AudioNotFound: () => serveAsset(c) }
  };
  return runInRequest({
    services: c.var.services,
    program: AudioService.use(audio =>
      audio.open({
        file,
        extension,
        ifNoneMatch: c.req.header("If-None-Match"),
        range: c.req.header("Range") ?? null
      })
    ),
    render
  });
});
