#!/usr/bin/env python3
"""Long-lived Fish Audio S2 Pro worker for scripts/generate-audio.mjs.

Reads job-file paths from stdin, one per line. For each job, encodes the voice
reference once and synthesises every chunk to <outDir>/<id>.wav. Reports one
JSON line per chunk and a final {"done": true} line. Sampling stays at the
mlx-speech defaults (temperature 0.8): the 2026-09-05 pilot showed style tags
and temperature 1.0 both add audible hiss.
"""
import json
import sys
import time
import wave
from pathlib import Path

import numpy as np
import mlx_speech

MODEL = "fish-s2-pro"
MAX_NEW_TOKENS = 2048  # chunks are <= 300 chars (~20 s); default 1024 is tight


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def write_wav(path: Path, audio: np.ndarray, sr: int) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def run_job(model, job_path: str) -> None:
    job = json.loads(Path(job_path).read_text())
    out = Path(job["outDir"])
    out.mkdir(parents=True, exist_ok=True)
    ref = model.prepare_reference(
        job["reference"]["audio"], reference_text=job["reference"]["text"]
    )
    for chunk in job["chunks"]:
        t0 = time.time()
        try:
            result = model.generate(
                chunk["text"], reference_audio=ref, max_new_tokens=MAX_NEW_TOKENS
            )
            audio = np.asarray(result.waveform, dtype=np.float32).reshape(-1)
            sr = int(result.sample_rate)
            write_wav(out / f"{chunk['id']}.wav", audio, sr)
            emit(
                {
                    "id": chunk["id"],
                    "seconds": len(audio) / sr,
                    "sampleRate": sr,
                    "wall": round(time.time() - t0, 1),
                }
            )
        except Exception as exc:  # report and keep going; the orchestrator decides
            emit({"id": chunk["id"], "error": f"{type(exc).__name__}: {exc}"})
    emit({"done": True, "job": job_path})


def main() -> int:
    t0 = time.time()
    model = mlx_speech.tts.load(MODEL)
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
