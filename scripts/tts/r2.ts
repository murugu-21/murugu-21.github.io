// cf R2 helpers for the audio scripts: object get/put and a login check,
// against the real bucket or, with --local, the local state `astro dev` serves
// (.cloudflare/state, not cf's default --persist-to).
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

import { z } from "zod";

import { jsonString } from "@worker/json.ts";
import { fail, run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
// Namespaced per voice so a new one never overwrites the last; worker/audio.ts
// serves the same prefix.
export const AUDIO_PREFIX = "blog/breeze";
export const VOICE_PREFIX = "voice/breeze";

// `cf r2 objects get` writes the body to stdout; spawnSync's 1 MB default
// would truncate a post's audio.
const MAX_OBJECT_BYTES = 1024 * 1024 * 1024;

// `authenticated` only means a token exists; `tokenValid` is the API check.
const WhoAmI = jsonString(z.object({ tokenValid: z.boolean().optional() }));

export function r2Store(local: boolean) {
  const args = ({ verb, key, extra = [] }: { verb: string; key: string; extra?: string[] }) => [
    "cf",
    "r2",
    "objects",
    verb,
    key,
    "--bucket-name",
    BUCKET,
    ...extra,
    ...(local ? ["--local", "--persist-to", ".cloudflare/state"] : [])
  ];

  // False only when the object is absent; other failures (expired login,
  // network) throw so they aren't mistaken for "nothing there yet".
  function get(key: string, file: string): boolean {
    const r = spawnSync("bunx", args({ verb: "get", key }), { maxBuffer: MAX_OBJECT_BYTES });
    if (r.status === 0) {
      writeFileSync(file, r.stdout);
      return true;
    }
    const err = `${r.stderr.toString()}\n${r.stdout.toString()}`;
    if (/10007|does not exist|NoSuchKey|404 Not Found/i.test(err)) return false;
    throw new Error(`cf r2 objects get ${key} failed:\n${err.trim()}`);
  }

  function put(key: string, file: string, contentType: string) {
    run("bunx", args({ verb: "put", key, extra: ["--file", file, "--content-type", contentType] }));
  }

  // Fail fast rather than after hours of local synthesis.
  function checkLogin() {
    if (local) return;
    const r = spawnSync("bunx", ["cf", "auth", "whoami"], { encoding: "utf8" });
    if (r.status !== 0 || !WhoAmI.safeParse(r.stdout).data?.tokenValid) {
      fail(
        "cf is not logged in (or the OAuth token expired); run `bunx cf auth login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}
