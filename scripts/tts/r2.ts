// wrangler R2 helpers for the audio scripts: object get/put and a login check,
// against --remote or a local `wrangler dev` bucket.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { fail, run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";

export function r2Store(local: boolean) {
  const args = (extra: string[]) => [
    "wrangler",
    "r2",
    "object",
    ...extra,
    local ? "--local" : "--remote"
  ];

  // False only when the object is genuinely absent. Any other wrangler failure
  // (expired login, network) throws, so a broken session can never be mistaken
  // for "nothing there yet".
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

  // Fail fast when wrangler cannot talk to Cloudflare, instead of finding out
  // after minutes (or hours) of local work.
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
