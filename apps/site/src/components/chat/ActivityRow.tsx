import { useEffect, useState } from "react";

import type { Activity, ToolName } from "@murugappan/contracts/chat.ts";

const WORDS = [
  "Discombobulating",
  "Consulting the archives",
  "Untangling the timelines",
  "Percolating",
  "Herding electrons",
  "Rummaging through blog posts",
  "Interrogating the résumé",
  "Reticulating splines",
  "Assembling adjectives",
  "Cross-examining the commit log",
  "Marshalling the particulars",
  "Warming up the anecdotes",
  "Consulting my better judgement"
];

const ROTATE_MS = 2600;
const ELAPSED_AFTER_MS = 3000;

function toolLabel(name: ToolName, detail?: string): string {
  if (name === "capture_opportunity") return "Noting your details";
  return detail ? `Reading ${detail.replaceAll(/^\/|\/$/g, "")}` : "Reading a page";
}

function pickWord(current: string): string {
  const pool = WORDS.filter(w => w !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function ActivityRow({ activity }: { activity: Activity | null }) {
  const [word, setWord] = useState(() => pickWord(""));
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const rotate = setInterval(() => setWord(pickWord), ROTATE_MS);
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, []);

  const showElapsed = elapsed >= ELAPSED_AFTER_MS / 1000;

  return (
    <>
      <div
        aria-hidden="true"
        className="flex max-w-4/5 items-center gap-2 self-start rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        {activity ? (
          <span className="size-2 flex-none animate-chat-tool-dot rounded-full bg-primary motion-reduce:animate-none" />
        ) : (
          <span className="animate-chat-spark text-xs leading-none text-primary motion-reduce:animate-none">
            ✦
          </span>
        )}
        <span
          // oxlint-disable-next-line tailwindcss/no-arbitrary-value -- the shimmer needs a background wider than the label; no bg-size default is a percentage
          className="animate-chat-shimmer bg-linear-90 from-muted-foreground from-35% via-foreground via-50% to-muted-foreground to-65% bg-size-[220%_100%] bg-clip-text text-transparent motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground"
        >
          {activity ? toolLabel(activity.name, activity.detail) : word}…
        </span>
        {showElapsed && <span className="text-xs tabular-nums opacity-60">{elapsed}s</span>}
      </div>
      <span className="sr-only">Jarvis is typing</span>
    </>
  );
}
