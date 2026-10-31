import type { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { z } from "zod";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { jsonString } from "@murugappan/utils/json.ts";
import { run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
export const VOICE_PREFIX = "voice/breeze";

export const audioKey = (slug: string, ext: "mp3" | "json") => `${AUDIO_PREFIX}/${slug}.${ext}`;

// `get` writes the body to stdout; spawnSync's 1 MB default would truncate a post's audio.
const MAX_OBJECT_BYTES = 1024 * 1024 * 1024;

type R2Location = "remote" | "local" | { persistTo: string };

// `bun run dev` and `bun run preview` keep apps/api's local state here. A bare --local would use
// ~/.config/cloudflare/state, which nothing serves.
const PREVIEW_STATE = join(import.meta.dirname, "..", "api", ".cloudflare", "state");

const locationFlags = (location: R2Location) => {
  if (location === "remote") return [];
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
}) => [
  "cf",
  "r2",
  "objects",
  verb,
  key,
  "--bucket-name",
  BUCKET,
  ...extra,
  ...locationFlags(location)
];

const LoggedIn = jsonString(
  z.object({ authenticated: z.literal(true), tokenValid: z.literal(true) })
);

const isMissingObject = (output: string) => /does not exist/i.test(output);

export function r2Store(location: R2Location) {
  function get(key: string): Buffer | null {
    const r = spawnSync("bunx", r2Args({ verb: "get", key, location }), {
      maxBuffer: MAX_OBJECT_BYTES
    });
    if (r.status === 0) return r.stdout;
    const err = `${r.stderr.toString()}\n${r.stdout.toString()}`;
    if (isMissingObject(err)) return null;
    throw new Error(`cf r2 objects get ${key} failed:\n${err.trim()}`);
  }

  function put({ key, file, contentType }: { key: string; file: string; contentType: string }) {
    const extra = ["--file", file, "--content-type", contentType];
    run("bunx", r2Args({ verb: "put", key, location, extra }));
  }

  function checkLogin() {
    if (location !== "remote") return;
    // whoami exits 0 when logged out, and reports a revoked token as authenticated.
    const r = spawnSync("bunx", ["cf", "auth", "whoami"], { encoding: "utf8" });
    if (!LoggedIn.safeParse(r.stdout).success) {
      throw new Error(
        "cf is not logged in; run `bunx cf auth login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}

export type R2Store = ReturnType<typeof r2Store>;
