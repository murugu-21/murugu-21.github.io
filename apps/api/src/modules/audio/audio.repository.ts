import { Context, Data, Effect, Layer } from "effect";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { WorkerEnv } from "#src/common/di/worker-env.ts";
import type { ByteRange } from "#src/modules/audio/byte-range.ts";

export class AudioNotFound extends Data.TaggedError("AudioNotFound") {}

/** Blog audio in R2 (packages/contracts/audio.ts). An R2 error is a defect, so the route 500s. */
export class AudioRepository extends Context.Service<
  AudioRepository,
  {
    head(file: string): Effect.Effect<R2Object, AudioNotFound>;
    read(input: {
      file: string;
      range: ByteRange | null;
    }): Effect.Effect<R2ObjectBody, AudioNotFound>;
  }
>()("@murugappan/api/AudioRepository") {
  static readonly layer = Layer.effect(
    AudioRepository,
    WorkerEnv.useSync(env => {
      const key = (file: string) => `${AUDIO_PREFIX}/${file}`;
      const found = <T>(object: T | null) =>
        object ? Effect.succeed(object) : Effect.fail(new AudioNotFound());
      return {
        head: file => Effect.promise(() => env.AUDIO.head(key(file))).pipe(Effect.flatMap(found)),
        read: ({ file, range }) =>
          Effect.promise(() => env.AUDIO.get(key(file), range ? { range } : undefined)).pipe(
            Effect.flatMap(found)
          )
      };
    })
  );
}
