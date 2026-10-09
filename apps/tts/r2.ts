// R2 helpers for the audio scripts, built on wrangler: get, put and a login
// check. "local" uses the local state that `bun run preview` serves, and
// `{ persistTo }` local state in a directory of the caller's choosing.
import type { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
// The voice reference the clones are made from; never served.
export const VOICE_PREFIX = "voice/breeze";

export const audioKey = (slug: string, ext: "mp3" | "json") => `${AUDIO_PREFIX}/${slug}.${ext}`;

// `--pipe` writes the body to stdout; spawnSync's 1 MB default would truncate a
// post's audio.
const MAX_OBJECT_BYTES = 1024 * 1024 * 1024;

type R2Location = "remote" | "local" | { persistTo: string };

// wrangler dev in apps/api keeps its state here. A bare --local would use this app's
// .wrangler/state, which nothing serves.
const PREVIEW_STATE = join(import.meta.dirname, "..", "api", ".wrangler", "state");

const locationFlags = (location: R2Location) => {
  if (location === "remote") return ["--remote"];
  const persistTo = location === "local" ? PREVIEW_STATE : location.persistTo;
  return ["--local", "--persist-to", persistTo];
};

const r2Args = ({
  verb,
  key,
  location,
  extra = []
}: {
  verb: string;
  key: string;
  location: R2Location;
  extra?: string[];
}) => ["wrangler", "r2", "object", verb, `${BUCKET}/${key}`, ...extra, ...locationFlags(location)];

// How `wrangler r2 object get` reports an absent object.
const isMissingObject = (output: string) => /does not exist/i.test(output);

export function r2Store(location: R2Location) {
  // Null only when the object is absent; other failures (expired login,
  // network) throw so they aren't mistaken for "nothing there yet".
  function get(key: string): Buffer | null {
    const r = spawnSync("bunx", r2Args({ verb: "get", key, location, extra: ["--pipe"] }), {
      maxBuffer: MAX_OBJECT_BYTES
    });
    if (r.status === 0) return r.stdout;
    const err = `${r.stderr.toString()}\n${r.stdout.toString()}`;
    if (isMissingObject(err)) return null;
    throw new Error(`wrangler r2 object get ${key} failed:\n${err.trim()}`);
  }

  function put({ key, file, contentType }: { key: string; file: string; contentType: string }) {
    const extra = ["--file", file, "--content-type", contentType];
    run("bunx", r2Args({ verb: "put", key, location, extra }));
  }

  // Fail fast rather than after hours of local synthesis.
  function checkLogin() {
    if (location !== "remote") return;
    // `--json` exits non-zero when wrangler is not authenticated.
    const r = spawnSync("bunx", ["wrangler", "whoami", "--json"], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(
        "wrangler is not logged in; run `bunx wrangler login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}

export type R2Store = ReturnType<typeof r2Store>;
