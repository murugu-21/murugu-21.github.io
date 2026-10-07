// Read-aloud controls for a blog post: the visible player state and the
// remembered speed. The backends live in #src/lib/blog/listen-player.ts.
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Pause, Play, type LucideIcon } from "lucide-react";

import { Button } from "#src/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "#src/components/ui/dropdown-menu.tsx";
import { Slider } from "#src/components/ui/slider.tsx";
import { track } from "#src/lib/analytics.ts";
import {
  canPlayAudio,
  canSpeak,
  collectBlocks,
  loadPlayer,
  type Block,
  type Player,
  type Progress,
  type Status
} from "#src/lib/blog/listen-player.ts";
import { parseRate, SPEECH_RATES, type SpeechRate } from "#src/lib/blog/speech.ts";

const formatTime = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const RATE_KEY = "listenRate";

const readStoredRate = (): SpeechRate => {
  try {
    return parseRate(localStorage.getItem(RATE_KEY));
  } catch {
    return 1;
  }
};

const storeRate = (rate: SpeechRate) => {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // private mode / storage blocked: the picker still works for this page
  }
};

// An external store: reading localStorage during hydration would mismatch the
// server HTML. Held in memory too so the picker works when storage is blocked.
let currentRate: SpeechRate | null = null;
const rateListeners = new Set<() => void>();

const subscribeRate = (onChange: () => void) => {
  rateListeners.add(onChange);
  return () => {
    rateListeners.delete(onChange);
  };
};

const getRate = (): SpeechRate => (currentRate ??= readStoredRate());
const getServerRate = (): SpeechRate => 1;

const publishRate = (next: SpeechRate) => {
  currentRate = next;
  storeRate(next);
  rateListeners.forEach(fn => fn());
};

interface View {
  status: Status;
  progress: Progress;
}

type Action = { status: Status } | { progress: Progress };

const INITIAL: View = { status: "idle", progress: { unit: "none", position: 0, length: 0 } };

const reduce = (view: View, action: Action): View => {
  if ("progress" in action) return { ...view, progress: action.progress };
  if (action.status === "idle") {
    return { status: "idle", progress: { ...view.progress, position: 0 } };
  }
  return { ...view, status: action.status };
};

interface ToggleLook {
  label: string;
  Icon: LucideIcon;
  iconClass: string;
  filled: boolean;
}

const LISTEN: ToggleLook = { label: "Listen", Icon: Play, iconClass: "ml-0.5", filled: true };

const TOGGLE: Record<Status, ToggleLook> = {
  idle: LISTEN,
  paused: LISTEN,
  loading: { label: "Loading", Icon: Loader2, iconClass: "animate-spin", filled: false },
  speaking: { label: "Pause", Icon: Pause, iconClass: "", filled: false }
};

// Elapsed and total, either side of the seek bar.
const READOUT: Record<Progress["unit"], (p: Progress) => [string, string]> = {
  none: () => ["0:00", ""],
  seconds: p => [formatTime(p.position), formatTime(p.length)],
  blocks: p => [`${p.position}/${p.length}`, "¶"]
};

export function ListenControls({ slug }: { slug: string }) {
  // The island root, held in state (not a ref) because it is read during
  // render as the dropdown's portal container.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const blocksRef = useRef<Block[]>([]);
  // False until mount finds something to read and a backend to read it with.
  const [supported, setSupported] = useState(false);
  const [{ status, progress }, dispatch] = useReducer(reduce, INITIAL);
  const rate = useSyncExternalStore(subscribeRate, getRate, getServerRate);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    blocksRef.current = collectBlocks();
    setSupported((canSpeak() || canPlayAudio()) && blocksRef.current.length > 0);
    // Chrome keeps talking after the tab navigates away otherwise.
    const onPageHide = () => playerRef.current?.pause();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Dock the transport bar while a session is live, including loading and
  // pauses; src/pages/blog/[...slug].astro styles `.listening`.
  useEffect(() => {
    const island = root?.closest(".listen-island");
    island?.classList.toggle("listening", status !== "idle");
  }, [root, status]);

  const onToggle = async () => {
    const player = playerRef.current;
    if (status === "speaking") {
      track("listen_pause");
      player?.pause();
      return;
    }
    if (player) {
      track("listen_resume");
      player.play();
      return;
    }
    track("listen_play", { post: slug });
    dispatch({ status: "loading" });
    const loaded = await loadPlayer({
      slug,
      blocks: blocksRef.current,
      rate: getRate,
      host: {
        setStatus: next => dispatch({ status: next }),
        setProgress: next => dispatch({ progress: next }),
        handOver: next => {
          playerRef.current = next;
        }
      }
    });
    playerRef.current = loaded;
    if (loaded) {
      loaded.play();
    } else {
      track("listen_unavailable");
      dispatch({ status: "idle" });
    }
  };

  const onRate = (next: SpeechRate) => {
    publishRate(next);
    track("listen_rate", { listen_rate: `${next}x` });
    playerRef.current?.setRate(next);
  };

  const toggle = TOGGLE[status];
  const [elapsed, total] = READOUT[progress.unit](progress);
  const seekable = progress.unit === "seconds";

  // Card surface: a translucent fill vanished into the gradient canvas. At
  // night the island --border (16%) is too faint, hence white/40.
  return (
    <div
      ref={setRoot}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2 shadow-sm dark:border-white/40"
    >
      <Button
        onClick={() => void onToggle()}
        // Rendered full-size but disabled until mount confirms a backend, so
        // hydration causes no layout shift.
        disabled={status === "loading" || !supported}
        aria-label={toggle.label}
        aria-pressed={status === "speaking"}
        className="size-10 shrink-0 rounded-full p-0 shadow-sm [&_svg:not([class*='size-'])]:size-5"
      >
        <toggle.Icon className={toggle.iconClass} fill={toggle.filled ? "currentColor" : "none"} />
      </Button>

      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {elapsed}
      </span>

      {/* Track at 30%/40% foreground: the primitive's 15% vanished on the
          card. Tuned here so the vendored slider keeps shadcn's styling. */}
      <Slider
        className="group min-w-0 flex-1 **:data-[slot=slider-thumb]:opacity-0 **:data-[slot=slider-thumb]:hover:opacity-100 **:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-foreground/30 dark:**:data-[slot=slider-track]:bg-foreground/40 hover:**:data-[slot=slider-thumb]:opacity-100 focus-within:**:data-[slot=slider-thumb]:opacity-100"
        value={[progress.position]}
        max={progress.length || 1}
        step={seekable ? 0.1 : 1}
        disabled={!seekable}
        aria-label="Seek"
        onValueChange={([v]) => playerRef.current?.seek?.(v)}
        // One event per scrub, not per drag tick.
        onValueCommit={() => track("listen_seek")}
      />

      <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">{total}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!supported}
            // Starts with the visible rate (e.g. "1×") so voice control can target it (WCAG 2.5.3).
            aria-label={`${rate}× playback speed`}
            // w-14 (not auto): a stored 1.25x would otherwise widen the pill
            // after hydration and nudge the row.
            className="h-7 w-14 shrink-0 rounded-full px-2.5 text-xs font-semibold tabular-nums"
          >
            {rate}×
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent container={root} align="end">
          <DropdownMenuRadioGroup value={String(rate)} onValueChange={v => onRate(parseRate(v))}>
            {SPEECH_RATES.map(r => (
              <DropdownMenuRadioItem key={r} value={String(r)}>
                {r}×
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
