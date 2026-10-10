# Public API

A free JSON API over the site's content at `/api/v1`, with no auth. Users read about it at [`/developers`](https://murugappan.dev/developers/) and [`/openapi.json`](https://murugappan.dev/openapi.json).

- The routes and schemas are defined in `packages/contracts/api/`. The OpenAPI document is generated from them, and a test checks it against the real routes.
- `/api` is an alias for `/api/v1`. A v2 would only exist at `/api/v2`.
- To deprecate a version, add it to `VERSIONS` in `packages/contracts/api/versioning.ts`. The deprecation headers follow from that.
- Rate limits are in `packages/contracts/api/quotas.ts`.
- `POST /api/v1/contact` emails me. Send `"dryRun": true` to test without sending.
