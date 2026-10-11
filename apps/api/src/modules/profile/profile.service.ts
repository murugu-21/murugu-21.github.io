import { Context, Effect, Layer } from "effect";
import type { z } from "zod";

import { ProfileRepository } from "#src/modules/profile/profile.repository.ts";

export class ProfileService extends Context.Service<
  ProfileService,
  {
    /** The part of the dataset `schema` picks; parsing drops the other keys. */
    slice<S extends z.ZodType>(schema: S): Effect.Effect<z.infer<S>>;
  }
>()("@murugappan/api/ProfileService") {
  static readonly layer = Layer.effect(
    ProfileService,
    Effect.gen(function* () {
      const repository = yield* ProfileRepository;
      return {
        slice: schema => repository.dataset.pipe(Effect.map(dataset => schema.parse(dataset)))
      };
    })
  );
}
