import { Hono, type Context } from "hono";
import type { z } from "zod";

import {
  EducationList,
  ExperienceList,
  OpenSourceList,
  Profile,
  SkillsResponse
} from "@murugappan/contracts/api/dataset.ts";
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
  .get("/profile", sliceHandler(Profile))
  .get("/experience", sliceHandler(ExperienceList))
  .get("/skills", sliceHandler(SkillsResponse))
  .get("/education", sliceHandler(EducationList))
  .get("/open-source", sliceHandler(OpenSourceList));
