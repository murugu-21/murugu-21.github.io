import type { RequestServices } from "#src/app.module.ts";
import type { ReadSlot } from "#src/modules/rate-limit/read-quota.store.ts";

type AppVariables = {
  services: RequestServices;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };

export type ApiEnv = {
  Bindings: Env;
  Variables: AppVariables & {
    readSlot: ReadSlot | null;
    /** Decided before `next()`, since `basePath(c)` moves as the router dispatches. */
    isContact: boolean;
  };
};
