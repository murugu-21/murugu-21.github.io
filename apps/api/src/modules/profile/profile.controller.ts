import { Hono, type Context } from "hono";
import type { z } from "zod";

import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse
} from "@murugappan/contracts/api/dataset.ts";
import { READ_METHODS } from "@murugappan/contracts/api/routes.ts";
import { runInRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { json } from "#src/common/http/json.ts";
import { ProfileService } from "#src/modules/profile/profile.service.ts";

const sliceHandler = (slice: z.ZodType) => (c: Context<AppEnv>) =>
  runInRequest({
    services: c.var.services,
    program: ProfileService.use(profile => profile.slice(slice)),
    render: { success: json, failures: {} }
  });

export const profileController = new Hono<AppEnv>()
  .on(READ_METHODS, "/profile", sliceHandler(Profile))
  .on(READ_METHODS, "/experience", sliceHandler(ExperienceList))
  .on(READ_METHODS, "/skills", sliceHandler(SkillsResponse))
  .on(READ_METHODS, "/education", sliceHandler(EducationList))
  .on(READ_METHODS, "/open-source", sliceHandler(OpenSourceList));
