// Fills the wait before the first token: the running tool, or a rotating word while the model reasons.
import { useEffect, useState } from "react";

import type { ToolName } from "#worker/protocol.ts";

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
  return detail ? `Reading ${detail.replace(/^\/|\/$/g, "")}` : "Reading a page";
}

function pickWord(current: string): string {
  const pool = WORDS.filter(w => w !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export type Activity = { name: ToolName; detail?: string };

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
        className="flex max-w-[85%] items-center gap-2 self-start rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        {activity ? <span className="chat-tool-dot" /> : <span className="chat-spark">✦</span>}
        <span className="chat-shimmer">
          {activity ? toolLabel(activity.name, activity.detail) : word}…
        </span>
        {showElapsed && <span className="text-xs tabular-nums opacity-60">{elapsed}s</span>}
      </div>
      <span className="sr-only">Jarvis is typing</span>
    </>
  );
}
