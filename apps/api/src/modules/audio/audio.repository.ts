import { Context, Data, Effect, Layer } from "effect";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { WorkerEnv } from "#src/common/di/worker-env.ts";
import type { ByteRange } from "#src/modules/audio/byte-range.ts";

export class AudioNotFound extends Data.TaggedError("AudioNotFound") {}

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
        head: Effect.fn("AudioRepository.head")(function* (file) {
          // oxlint-disable-next-line no-restricted-properties -- an R2 error is a defect, so the route 500s
          const object = yield* Effect.promise(() => env.AUDIO.head(key(file)));
          return yield* found(object);
        }),
        read: Effect.fn("AudioRepository.read")(function* ({ file, range }) {
          const options = range ? { range } : undefined;
          // oxlint-disable-next-line no-restricted-properties -- an R2 error is a defect, so the route 500s
          const object = yield* Effect.promise(() => env.AUDIO.get(key(file), options));
          return yield* found(object);
        })
      };
    })
  );
}
