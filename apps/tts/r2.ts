import type { Buffer } from "node:buffer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { AUDIO_PREFIX } from "@murugappan/contracts/audio.ts";
import { jsonString } from "@murugappan/utils/json.ts";
import { spawnCollect } from "@murugappan/utils/node/process.ts";
import { run } from "./cli.ts";

const BUCKET = "murugappan-dev-audio";
export const VOICE_PREFIX = "voice/breeze";

export const audioKey = (slug: string, ext: "mp3" | "json") => `${AUDIO_PREFIX}/${slug}.${ext}`;

// Not `bunx cf`: run from the repo root, it falls back to a global cf instead of the pinned one.
const PINNED_CF = join(dirname(fileURLToPath(import.meta.resolve("cf/package.json"))), "bin", "cf");

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
}) => ["r2", "objects", verb, key, "--bucket-name", BUCKET, ...extra, ...locationFlags(location)];

const LoggedIn = jsonString(
  z.object({ authenticated: z.literal(true), tokenValid: z.literal(true) })
);

const isMissingObject = (output: string) => /does not exist/i.test(output);

export function r2Store(location: R2Location) {
  async function get(key: string): Promise<Buffer | null> {
    const r = await spawnCollect(PINNED_CF, r2Args({ verb: "get", key, location }));
    if (r.status === 0) return r.stdout;
    const err = `${r.stderr}\n${r.stdout.toString()}`;
    if (isMissingObject(err)) return null;
    throw new Error(`cf r2 objects get ${key} failed:\n${err.trim()}`);
  }

  async function put({
    key,
    file,
    contentType
  }: {
    key: string;
    file: string;
    contentType: string;
  }) {
    const extra = ["--file", file, "--content-type", contentType];
    await run(PINNED_CF, r2Args({ verb: "put", key, location, extra }));
  }

  async function checkLogin() {
    if (location !== "remote") return;
    // whoami exits 0 when logged out, and reports a revoked token as authenticated.
    const { stdout } = await spawnCollect(PINNED_CF, ["auth", "whoami"]);
    if (!LoggedIn.safeParse(stdout.toString()).success) {
      throw new Error(
        "cf is not logged in; run `bunx cf auth login` in an interactive terminal, then retry"
      );
    }
  }

  return { get, put, checkLogin };
}

export type R2Store = ReturnType<typeof r2Store>;
