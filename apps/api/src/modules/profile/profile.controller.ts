import { Hono } from "hono";
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

export const profileController = new Hono<AppEnv>();

const sliceRoute = (path: string, slice: z.ZodType) =>
  profileController.on(READ_METHODS, path, c =>
    runInRequest({
      services: c.var.services,
      program: ProfileService.use(profile => profile.slice(slice)),
      render: { success: json, failures: {} }
    })
  );

sliceRoute("/profile", Profile);
sliceRoute("/experience", ExperienceList);
sliceRoute("/skills", SkillsResponse);
sliceRoute("/education", EducationList);
sliceRoute("/open-source", OpenSourceList);
