#!/usr/bin/env python3
"""Long-lived word-timestamp worker for scripts/align-audio.mjs.

Reads JSON lines from stdin: {"id", "wav", "text"} where wav is a 16 kHz mono
slice of one block and text is what it says. Replies with one JSON line per
job: {"id", "words": [{"word", "start", "end"}]} in seconds relative to the
slice, or {"id", "error"}. The known text is passed as initial_prompt so
whisper spells names and numbers the way the post does, which makes the
sequence match in audio-words.ts far more forgiving.
"""
import json
import sys
import time

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line or line == "quit":
            if line == "quit":
                break
            continue
        job = json.loads(line)
        t0 = time.time()
        try:
            result = mlx_whisper.transcribe(
                job["wav"],
                path_or_hf_repo=MODEL,
                language="en",
                word_timestamps=True,
                initial_prompt=job.get("text"),
                condition_on_previous_text=False,
                temperature=0.0,
            )
            words = [
                {"word": w["word"], "start": float(w["start"]), "end": float(w["end"])}
                for seg in result.get("segments", [])
                for w in seg.get("words", [])
            ]
            emit({"id": job["id"], "words": words, "wall": round(time.time() - t0, 2)})
        except Exception as exc:  # report and keep serving
            emit({"id": job["id"], "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
