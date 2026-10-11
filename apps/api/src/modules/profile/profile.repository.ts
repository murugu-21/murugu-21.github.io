import { Context, Effect, Layer } from "effect";

import type { Dataset } from "@murugappan/contracts/api/dataset.ts";
import { DATASET } from "#src/common/content.ts";

export class ProfileRepository extends Context.Service<
  ProfileRepository,
  { readonly dataset: Effect.Effect<Dataset> }
>()("@murugappan/api/ProfileRepository") {
  static readonly layer = Layer.succeed(ProfileRepository, { dataset: Effect.succeed(DATASET) });
}
