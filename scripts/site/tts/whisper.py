"""Long-lived word-timestamp worker for scripts/site/align-audio.ts.

Reads JSON lines from stdin: {"id", "wav", "text"} where wav is a 16 kHz mono
slice of one block and text is what it says. Replies with one JSON line per
job: {"id", "words": [{"word", "start", "end"}]} in seconds relative to the
slice, or {"id", "error"}. The known text is the initial_prompt so whisper
spells names and numbers like the post, which makes the match in
audio-words.ts easier.
"""

import json
import sys
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
        if line == "quit":
            break
        if not line:
            continue
        job = json.loads(line)
        try:
            words = transcribe(job["wav"], job.get("text"))
            # Whisper sometimes treats the prompt as already spoken and returns
            # a closing phrase; far too few words means retry unprompted.
            expected = len((job.get("text") or "").split())
            if expected and len(words) < 0.6 * expected:
                retry = transcribe(job["wav"], None)
                if len(retry) > len(words):
                    words = retry
            emit({"id": job["id"], "words": words})
        except Exception as exc:  # noqa: BLE001  # report and keep serving
            emit({"id": job["id"], "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
