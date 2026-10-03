// wrangler R2 helpers for the audio scripts: object get/put and a login check,
// against --remote or the local R2 that `bun run dev` serves.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { fail, run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
// Namespaced per voice so a new one never overwrites the last; worker/audio.ts
// serves the same prefix.
export const AUDIO_PREFIX = "blog/breeze";
export const VOICE_PREFIX = "voice/breeze";

export function r2Store(local: boolean) {
  const args = (extra: string[]) => [
    "wrangler",
    "r2",
    "object",
    ...extra,
    local ? "--local" : "--remote"
  ];

  // False only when the object is absent; other failures (expired login,
  // network) throw so they aren't mistaken for "nothing there yet".
  function get(key: string, file: string): boolean {
    const r = spawnSync("bunx", args(["get", `${BUCKET}/${key}`, "--file", file]), {
      encoding: "utf8"
    });
    if (r.status === 0 && existsSync(file)) return true;
    const err = `${r.stderr}\n${r.stdout}`;
    if (/not found|does not exist|NoSuchKey|10007/i.test(err)) return false;
    throw new Error(`wrangler r2 object get ${key} failed:\n${err.trim()}`);
  }

  function put(key: string, file: string, contentType: string) {
    run("bunx", args(["put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType]));
  }

  // Fail fast rather than after hours of local synthesis.
  function checkLogin() {
    if (local) return;
    const r = spawnSync("bunx", ["wrangler", "whoami"], { encoding: "utf8" });
    if (r.status !== 0 || /not logged in|expired/i.test(`${r.stderr}${r.stdout}`)) {
      fail(
        "wrangler is not logged in (or the OAuth token expired) — run `bunx wrangler login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}
