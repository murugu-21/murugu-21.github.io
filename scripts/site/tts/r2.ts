// R2 helpers for the audio scripts, built on the cf CLI: get, put and a login
// check. With --local they use the local state that `astro dev` serves
// (.cloudflare/state, not cf's default --persist-to).
import type { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";

import { z } from "zod";

import { jsonString } from "#utils/json.ts";
import { run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
// The voice reference the clones are made from; never served.
export const VOICE_PREFIX = "voice/breeze";

// `cf r2 objects get` writes the body to stdout; spawnSync's 1 MB default
// would truncate a post's audio.
const MAX_OBJECT_BYTES = 1024 * 1024 * 1024;

// `authenticated` only means a token exists; `tokenValid` is the API check.
const WhoAmI = jsonString(z.object({ tokenValid: z.boolean().optional() }));

export const tokenValid = (whoami: string) => WhoAmI.safeParse(whoami).data?.tokenValid ?? false;

export const r2Args = ({
  verb,
  key,
  local,
  extra = []
}: {
  verb: string;
  key: string;
  local: boolean;
  extra?: string[];
}) => [
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

// How `cf r2 objects get` reports an absent object.
export const isMissingObject = (output: string) =>
  /10007|does not exist|NoSuchKey|404 Not Found/i.test(output);

export function r2Store(local: boolean) {
  // Null only when the object is absent; other failures (expired login,
  // network) throw so they aren't mistaken for "nothing there yet".
  function get(key: string): Buffer | null {
    const r = spawnSync("bunx", r2Args({ verb: "get", key, local }), {
      maxBuffer: MAX_OBJECT_BYTES
    });
    if (r.status === 0) return r.stdout;
    const err = `${r.stderr.toString()}\n${r.stdout.toString()}`;
    if (isMissingObject(err)) return null;
    throw new Error(`cf r2 objects get ${key} failed:\n${err.trim()}`);
  }

  function put({ key, file, contentType }: { key: string; file: string; contentType: string }) {
    const extra = ["--file", file, "--content-type", contentType];
    run("bunx", r2Args({ verb: "put", key, local, extra }));
  }

  // Fail fast rather than after hours of local synthesis.
  function checkLogin() {
    if (local) return;
    const r = spawnSync("bunx", ["cf", "auth", "whoami"], { encoding: "utf8" });
    if (r.status !== 0 || !tokenValid(r.stdout)) {
      throw new Error(
        "cf is not logged in (or the OAuth token expired); run `bunx cf auth login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}
