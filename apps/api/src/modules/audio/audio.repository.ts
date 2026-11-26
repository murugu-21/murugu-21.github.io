import { Context, Data, Effect, Layer, Predicate } from "effect";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { WorkerEnv } from "#src/common/di/worker-env.ts";
import type { ByteRange } from "#src/modules/audio/byte-range.ts";

class AudioNotFound extends Data.TaggedError("AudioNotFound") {}

class AudioUnavailable extends Data.TaggedError("AudioUnavailable")<{
  readonly cause: unknown;
}> {}

export type AudioError = AudioNotFound | AudioUnavailable;

export class AudioRepository extends Context.Service<
  AudioRepository,
  {
    head(file: string): Effect.Effect<R2Object, AudioError>;
    read(input: { file: string; range: ByteRange | null }): Effect.Effect<R2ObjectBody, AudioError>;
  }
>()("@murugappan/api/AudioRepository") {
  static readonly layer = Layer.effect(
    AudioRepository,
    WorkerEnv.useSync(env => {
      const key = (file: string) => `${AUDIO_PREFIX}/${file}`;
      const found = <T>(load: () => Promise<T | null>) =>
        Effect.tryPromise({ try: load, catch: cause => new AudioUnavailable({ cause }) }).pipe(
          Effect.filterOrFail(Predicate.isNotNull, () => new AudioNotFound())
        );
      return {
        head: Effect.fn("AudioRepository.head")(function* (file) {
          return yield* found(() => env.AUDIO.head(key(file)));
        }),
        read: Effect.fn("AudioRepository.read")(function* ({ file, range }) {
          const options = range ? { range } : undefined;
          return yield* found(() => env.AUDIO.get(key(file), options));
        })
      };
    })
  );
}
