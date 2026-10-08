# Public API

A developer or agent reads the site's content as JSON under `/api/v1`, with rate-limit and version headers on every response. They can also send the owner a message through the contact endpoint.

## Sub-features

- `api-read` returns profile, experience, skills, education, open-source and posts as JSON.
- `api-posts-search` filters posts with `?q=` and `?limit=`.
- `api-404` answers an unknown API path with a JSON 404, never HTML.
- `api-contact-dry` validates a contact payload without sending or using a slot.
- `api-contact-send` emails the owner and uses one of three daily slots.

## How to get to it (user POV)

- `GET /api/v1/<resource>`, or the unversioned `/api/<resource>` alias.
- `POST /api/v1/contact` with a JSON body.
- The spec at `/openapi.json`. The `/developers/` page documents it but isn't mapped yet.

## Driving it with curl

Preconditions:

- `B=http://localhost:8791; E="$RUN/evidence/public-api"; mkdir -p "$E"`.

Steps:

- **`api-read`.** `curl -sS -D "$E/api-read.headers" -o "$E/api-read.body" -w '%{http_code}\n' "$B/api/v1/profile"` prints `200`. The headers include `API-Version: 1.0.0` and `RateLimit-Policy: "reads";q=600;w=60`, and the body's `person.name` is `Murugappan M`.
- **`api-posts-search`.** `curl -sS "$B/api/v1/posts?q=rate&limit=2"` returns at most two posts whose title, description or tags match `rate`.
- **`api-404`.** `curl -sS -i "$B/api/v1/nope"` returns `404` with `Content-Type: application/json` and a `Link` header naming `/openapi.json` as `service-desc`.
- **`api-contact-dry`.** `curl -sS -i -X POST "$B/api/v1/contact" -H 'Content-Type: application/json' -d '{"name":"Verify Bot","email":"verify@example.com","message":"verify-murugappan-dev dry run probe","dryRun":true}'` returns `200` with `"status": "validated"`, and the `RateLimit` header still reads `"contact-client";r=3`.
- **`api-contact-send`.** Run the same request without `dryRun`. It returns `202` with `"status": "accepted"`, and `RateLimit` drops to `r=2`. `worker.log` prints `send_email binding called` with the subject `New message via the murugappan.dev API from Verify Bot` and a `Text:` file path. Copy that file into `$E` now, because it's deleted when wrangler exits.

## Gotchas

- Locally the `EMAIL` binding writes the message to a file under `.wrangler/tmp/email/` and sends nothing.
- `message` needs at least 20 characters, or the request gets a `422` naming the field.
- Contact slots live in this run's `--persist-to` state. A fresh run has all three, and a reused one may be at `r=0`.
- The read limit counts per isolate, so restarting the instance resets it.
