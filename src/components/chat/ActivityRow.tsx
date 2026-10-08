// Fills the wait before the first token: the running tool, or a rotating word while the model reasons.
import { useEffect, useState } from "react";

import type { Activity, ToolName } from "#contracts/chat.ts";

// Jarvis's voice: dry, never cutesy. No promises about the answer, nothing that reads like an error.
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
// Long enough that a fast answer never flashes a counter at the visitor.
const ELAPSED_AFTER_MS = 3000;

// The worker sends the semantic event; the wording lives here with the UI copy.
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

  // The row unmounts when the first delta lands, so the timers never need resetting.
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
      {/* aria-hidden: it changes every 2.6s inside an aria-live region; the
          stable line below is announced instead. */}
      <div
        aria-hidden="true"
        className="flex max-w-4/5 items-center gap-2 self-start rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        {/* The spark marks a thinking beat, the dot a real tool call. */}
        {activity ? (
          <span className="size-2 flex-none animate-chat-tool-dot rounded-full bg-primary motion-reduce:animate-none" />
        ) : (
          <span className="animate-chat-spark text-xs leading-none text-primary motion-reduce:animate-none">
            ✦
          </span>
        )}
        {/* Reduced motion undoes the gradient too, or the label stays transparent. */}
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
