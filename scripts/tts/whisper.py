"""Long-lived word-timestamp worker for scripts/align-audio.ts.

Reads JSON lines from stdin: {"id", "wav", "text"} where wav is a 16 kHz mono
slice of one block and text is what it says. Replies with one JSON line per
job: {"id", "words": [{"word", "start", "end"}]} in seconds relative to the
slice, or {"id", "error"}. The known text is passed as initial_prompt so
whisper spells names and numbers the way the post does, which makes the
sequence match in audio-words.ts far more forgiving. When the prompted pass
returns far fewer words than the text has, it is retried without the prompt
(see the comment in main).
"""
import json
import sys
import time
from typing import Any

import mlx_whisper

MODEL = "mlx-community/whisper-large-v3-turbo"


def emit(obj: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def transcribe(wav: str, prompt: str | None) -> list[dict[str, Any]]:
    result: dict[str, Any] = mlx_whisper.transcribe(
        wav,
        path_or_hf_repo=MODEL,
        language="en",
        word_timestamps=True,
        initial_prompt=prompt,
        condition_on_previous_text=False,
        temperature=0.0,
    )
    return [
        {"word": w["word"], "start": float(w["start"]), "end": float(w["end"])}
        for seg in result.get("segments", [])
        for w in seg.get("words", [])
    ]


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
            words = transcribe(job["wav"], job.get("text"))
            # Whisper sometimes treats the prompt as already-spoken text and
            # answers with a closing phrase ("Thank you for your time.", 5
            # words for a 60-word paragraph). Far too few words → retry without
            # the prompt, which reads the audio on its own terms.
            expected = len((job.get("text") or "").split())
            if expected and len(words) < 0.6 * expected:
                retry = transcribe(job["wav"], None)
                if len(retry) > len(words):
                    words = retry
            emit({"id": job["id"], "words": words, "wall": round(time.time() - t0, 2)})
        except Exception as exc:  # noqa: BLE001 — report and keep serving
            emit({"id": job["id"], "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
