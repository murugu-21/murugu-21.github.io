"""Long-lived Breeze TTS 2 worker for scripts/generate-audio.ts.

Reads job-file paths from stdin, one per line. For each job, synthesises every
chunk to <outDir>/<id>.wav as a plain clone of the voice reference and reports
one JSON line per chunk plus a final {"done": true} line.

Plain clone on purpose: the reference clip was *designed* once from a persona
prompt (scripts/tts/design-voice.py), so passing an instruction here would only
double the cost (classifier-free guidance runs the 3B backbone twice per frame)
and let the delivery drift between paragraphs. The 8-bit build is 3x faster
than bf16 on a 24 GB machine, which swaps on the 7 GB weights (2026-09-09).
"""
import contextlib
import json
import sys
import time
import wave
from pathlib import Path

import mlx.core as mx
import numpy as np

MODEL = "mlx-community/Breeze-TTS-2-mlx-8bit"
SAMPLE_RATE = 24000
MAX_TOKENS = 1500  # 12.5 frames/s → 120 s; chunks are ≤300 chars (~30 s)
# MLX keeps freed Metal buffers in a cache that otherwise grows with every
# chunk: a full-blog run reached a 19 GB footprint on a 24 GB machine and slowed
# 6x once the OS started swapping (2026-09-10). Cap the cache and drop it after
# each chunk; the model's own weights are ~4 GB.
CACHE_LIMIT = 1 << 30

# The JSON protocol owns real stdout; anything the model library prints
# (download progress, warnings) is diverted to stderr.
PROTOCOL = sys.stdout
sys.stdout = sys.stderr


def emit(obj: dict[str, object]) -> None:
    PROTOCOL.write(json.dumps(obj) + "\n")
    PROTOCOL.flush()


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())


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
            write_wav(out / f"{chunk['id']}.wav", audio)
            mx.clear_cache()
            emit(
                {
                    "id": chunk["id"],
                    "seconds": len(audio) / SAMPLE_RATE,
                    "sampleRate": SAMPLE_RATE,
                    "wall": round(time.time() - t0, 1),
                }
            )
        except Exception as exc:  # noqa: BLE001 — report and keep going; the orchestrator decides
            emit({"id": chunk["id"], "error": f"{type(exc).__name__}: {exc}"})
    emit({"done": True, "job": job_path})


def main() -> int:
    from mlx_audio.tts import load

    t0 = time.time()
    mx.set_cache_limit(CACHE_LIMIT)
    with contextlib.redirect_stdout(sys.stderr):
        model = load(MODEL)
    emit({"ready": True, "model": MODEL, "loadSeconds": round(time.time() - t0, 1)})
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
