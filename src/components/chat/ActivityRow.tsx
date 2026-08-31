// The waiting state of the chat panel. DeepSeek V4-Flash reasons before it
// answers, so the gap before the first token is long enough to need filling —
// this row says what Jarvis is actually doing when a tool is running, and
// keeps the visitor amused with a rotating word when it is only thinking.
import {useEffect, useRef, useState} from "react";

import type {ToolName} from "../../../worker/protocol";

// Deliberately in Jarvis's voice: dry, a little absurd, never cutesy. Two
// rules — no promises about what the answer will contain, and nothing that
// reads like an error.
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

// What a running tool call looks like in the row. The worker sends the
// semantic event; the wording lives here with the rest of the UI copy.
function toolLabel(name: ToolName, detail?: string): string {
  if (name === "capture_opportunity") return "Noting your details";
  return detail
    ? `Reading ${detail.replace(/^\/|\/$/g, "")}`
    : "Reading a page";
}

function pickWord(current: string): string {
  const pool = WORDS.filter(w => w !== current);
  return pool[Math.floor(Math.random() * pool.length)];
}

export type Activity = {name: ToolName; detail?: string};

export function ActivityRow({activity}: {activity: Activity | null}) {
  const [word, setWord] = useState(() => pickWord(""));
  const [elapsed, setElapsed] = useState(0);
  // Set for real by the effect below, which runs before the interval that
  // reads it exists — so the placeholder is never observed.
  const startRef = useRef(0);

  // One timer pair for the life of the row: it mounts when the turn starts and
  // unmounts when the first delta lands, so there is nothing to reset.
  useEffect(() => {
    startRef.current = Date.now();
    const rotate = setInterval(() => setWord(pickWord), ROTATE_MS);
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000
    );
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, []);

  const showElapsed = elapsed >= ELAPSED_AFTER_MS / 1000;

  return (
    <>
      {/* The visible row is hidden from screen readers: it changes every 2.6s
          inside the panel's aria-live region, which would talk over itself.
          The stable line below is what assistive tech announces instead. */}
      <div
        aria-hidden="true"
        className="flex max-w-[85%] items-center gap-2 self-start rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground"
      >
        {activity ? (
          <span className="chat-tool-dot" />
        ) : (
          <span className="chat-spark">✦</span>
        )}
        <span className="chat-shimmer">
          {activity ? toolLabel(activity.name, activity.detail) : word}…
        </span>
        {showElapsed && (
          <span className="text-xs tabular-nums opacity-60">{elapsed}s</span>
        )}
      </div>
      <span className="sr-only">Jarvis is typing</span>
    </>
  );
}
