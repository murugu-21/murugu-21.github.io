import { Hono } from "hono";

import { PostsQuery } from "@murugappan/contracts/api/posts.ts";
import { runInRequest } from "#src/app.module.ts";
import type { AppEnv } from "#src/common/app-env.ts";
import { apiError } from "#src/common/http/api-error.ts";
import { json } from "#src/common/http/json.ts";
import { queryPipe } from "#src/common/pipes/query.pipe.ts";
import { PostsService } from "#src/modules/posts/posts.service.ts";

export const postsController = new Hono<AppEnv>()
  .get(
    "/posts",
    queryPipe({
      schema: PostsQuery,
      hint: "Correct the parameters listed in details, or omit them to get every post."
    }),
    c => {
      const { q, limit } = c.var.query;
      return runInRequest({
        services: c.var.services,
        program: PostsService.use(posts => posts.search({ query: q, limit })),
        render: { success: json, failures: {} }
      });
    }
  )
  .get("/posts/:slug", c =>
    runInRequest({
      services: c.var.services,
      program: PostsService.use(posts => posts.findBySlug(c.req.param("slug"))),
      render: {
        success: json,
        failures: {
          PostNotFound: ({ slug }) =>
            apiError({
              status: 404,
              code: "not_found",
              message: `No published post has the slug '${slug}'.`,
              hint: "Call GET /api/posts to list the slugs that exist."
            })
        }
      }
    })
  );
