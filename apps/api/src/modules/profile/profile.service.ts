import { Context, Effect, Layer } from "effect";
import type { z } from "zod";

import { ProfileRepository } from "#src/modules/profile/profile.repository.ts";

export class ProfileService extends Context.Service<
  ProfileService,
  {
    slice<S extends z.ZodType>(schema: S): Effect.Effect<z.infer<S>>;
  }
>()("@murugappan/api/ProfileService") {
  static readonly layer = Layer.effect(
    ProfileService,
    Effect.gen(function* () {
      const repository = yield* ProfileRepository;
      return {
        slice: Effect.fn("ProfileService.slice")(function* <S extends z.ZodType>(schema: S) {
          return schema.parse(yield* repository.dataset);
        })
      };
    })
  );
}
