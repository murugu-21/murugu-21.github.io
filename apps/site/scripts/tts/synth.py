"""Long-lived Breeze TTS 2 worker for apps/site/scripts/generate-audio.ts.

Reads job-file paths from stdin, one per line. For each job, synthesises every
chunk to <outDir>/<id>.wav as a plain clone of the voice reference and reports
one JSON line per chunk plus a final {"done": true} line.

Plain clone on purpose. The reference was already designed (design-voice.py),
and an instruction here doubles the cost (CFG runs the backbone twice) and lets
delivery drift. 8-bit because bf16's 7 GB weights swap on a 24 GB machine.
"""

import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import numpy as np

from wavfile import write_wav

MODEL = "mlx-community/Breeze-TTS-2-mlx-8bit"
SAMPLE_RATE = 24000
MAX_TOKENS = 1500  # 120 s at 12.5 frames/s; chunks are at most 300 chars (~30 s)
# MLX's Metal buffer cache grows every chunk until the OS swaps; cap it and
# clear it after each chunk.
CACHE_LIMIT = 1 << 30

# The JSON protocol owns real stdout; library output goes to stderr.
PROTOCOL = sys.stdout
sys.stdout = sys.stderr


def emit(obj: dict[str, object]) -> None:
    PROTOCOL.write(json.dumps(obj) + "\n")
    PROTOCOL.flush()


def synthesize(model, text: str, reference: dict[str, str]) -> np.ndarray:
    parts = []
    for chunk in model.generate(
        text=text,
        ref_audio=reference["audio"],
        ref_text=reference["text"],
        max_tokens=MAX_TOKENS,
    ):
        if int(chunk.sample_rate) != SAMPLE_RATE:
            raise RuntimeError(f"unexpected sample rate {chunk.sample_rate}")
        parts.append(np.asarray(chunk.audio, dtype=np.float32).reshape(-1))
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


def run_job(model, job_path: str) -> None:
    job = json.loads(Path(job_path).read_text())
    out = Path(job["outDir"])
    out.mkdir(parents=True, exist_ok=True)
    reference = job["reference"]
    for chunk in job["chunks"]:
        t0 = time.time()
        try:
            audio = synthesize(model, chunk["text"], reference)
            if audio.size == 0:
                raise RuntimeError("model produced no audio")
            write_wav(out / f"{chunk['id']}.wav", audio, SAMPLE_RATE)
            mx.clear_cache()
            emit(
                {
                    "id": chunk["id"],
                    "seconds": len(audio) / SAMPLE_RATE,
                    "wall": round(time.time() - t0, 1),
                }
            )
        except Exception as exc:  # noqa: BLE001  # report and keep going; the orchestrator decides
            emit({"id": chunk["id"], "error": f"{type(exc).__name__}: {exc}"})
    emit({"done": True})


def main() -> int:
    from mlx_audio.tts import load

    t0 = time.time()
    mx.set_cache_limit(CACHE_LIMIT)
    model = load(MODEL)
    emit(
        {
            "ready": True,
            "model": MODEL,
            "loadSeconds": round(time.time() - t0, 1),
            "sampleRate": SAMPLE_RATE,
        }
    )
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        if line == "quit":
            break
        run_job(model, line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
