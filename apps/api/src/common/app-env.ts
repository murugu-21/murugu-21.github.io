import type { RequestServices } from "#src/app.module.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

type AppVariables = {
  /** Set for every request by `createApp`, for controllers to pass to `runInRequest`. */
  services: RequestServices;
};

/** Every router's Hono env. */
export type AppEnv = { Bindings: Env; Variables: AppVariables };

/** The API routers' Hono env. The read-throttle guard leaves its verdict here for the API headers interceptor. */
export type ApiEnv = {
  Bindings: Env;
  Variables: AppVariables & {
    readSlot: ReadSlot | null;
    /** Decided before `next()`, since `basePath(c)` moves as the router dispatches. */
    isContact: boolean;
  };
};
