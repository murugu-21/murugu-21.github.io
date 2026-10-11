import { Context, Effect, Layer } from "effect";

import { defaultContentType, type AudioExtension } from "#src/modules/audio/audio-file.ts";
import { AudioRepository, type AudioNotFound } from "#src/modules/audio/audio.repository.ts";
import { etagMatches, parseRange, type ByteRange } from "#src/modules/audio/byte-range.ts";

export type AudioMeta = { etag: string; contentType: string; size: number };

export type AudioReply =
  | { kind: "not-modified"; meta: AudioMeta }
  | { kind: "unsatisfiable"; meta: AudioMeta }
  | { kind: "content"; meta: AudioMeta; body: ReadableStream; range: ByteRange | null };

/** Decides how to answer a request for one audio file: 304, 416, a byte range, or all of it. */
export class AudioService extends Context.Service<
  AudioService,
  {
    open(request: {
      file: string;
      extension: AudioExtension;
      ifNoneMatch: string | undefined;
      range: string | null;
    }): Effect.Effect<AudioReply, AudioNotFound>;
  }
>()("@murugappan/api/AudioService") {
  static readonly layer = Layer.effect(
    AudioService,
    Effect.gen(function* () {
      const repository = yield* AudioRepository;
      return {
        open: Effect.fn("AudioService.open")(function* ({ file, extension, ifNoneMatch, range }) {
          const head = yield* repository.head(file);
          const meta: AudioMeta = {
            etag: head.httpEtag,
            contentType: head.httpMetadata?.contentType ?? defaultContentType(extension),
            size: head.size
          };
          if (etagMatches({ header: ifNoneMatch, etag: meta.etag }))
            return { kind: "not-modified", meta } satisfies AudioReply;

          const byteRange = parseRange(range, head.size);
          if (byteRange === "unsatisfiable")
            return { kind: "unsatisfiable", meta } satisfies AudioReply;

          const object = yield* repository.read({ file, range: byteRange });
          return {
            kind: "content",
            meta,
            body: object.body,
            range: byteRange
          } satisfies AudioReply;
        })
      };
    })
  );
}
