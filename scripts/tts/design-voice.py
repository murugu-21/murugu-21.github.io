"""Design the read-aloud voice once, from a persona prompt (Breeze TTS 2 voice design).

  .venv-tts/bin/python scripts/tts/design-voice.py [count]

Writes <count> candidates (default 3) to .voice/candidates/<k>.wav plus the
sentence they speak in .voice/candidates/reference.txt. Listen, then promote
the one you like:

  cp .voice/candidates/1.wav .voice/reference.wav
  cp .voice/candidates/reference.txt .voice/reference.txt
  npm run audio -- --upload-voice

Every post is then a plain clone of that clip (scripts/tts/synth.py), which is
what keeps the identity fixed across paragraphs. Voice design is sampled, so
candidates differ; the prompt below produced the clip in use on 2026-09-09.
"""
import contextlib
import sys
import time
import wave
from pathlib import Path
from typing import Any

import numpy as np

MODEL = "mlx-community/Breeze-TTS-2-mlx-8bit"
SAMPLE_RATE = 24000
CFG_SCALE = 4  # the upstream voice-design default; needed for the prompt to bite

PERSONA = (
    "A 25-year-old male software engineer from Chennai with a light Tamil-influenced "
    "Indian English accent, recording the audio version of his own blog post. Quiet "
    "confidence and a bit of dry humour. Natural conversational pace, slight emphasis "
    "on key terms, brief pauses between ideas."
)

# ~10 s when spoken: long enough to anchor a clone, short enough to design fast.
SENTENCE = (
    "Hey there, if you are reading this in a desktop, press ctrl + shift + i and "
    "open console and paste the below code."
)


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm.tobytes())


def main() -> int:
    from mlx_audio.tts import load

    count = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    out = Path(__file__).resolve().parents[2] / ".voice" / "candidates"
    out.mkdir(parents=True, exist_ok=True)
    (out / "reference.txt").write_text(SENTENCE + "\n")
    with contextlib.redirect_stdout(sys.stderr):
        # load() is typed as the generic nn.Module; generate() is the Breeze model's.
        model: Any = load(MODEL)
    for k in range(count):
        t0 = time.time()
        parts = [
            np.asarray(c.audio, dtype=np.float32).reshape(-1)
            for c in model.generate(text=SENTENCE, instruct=PERSONA, cfg_scale=CFG_SCALE)
        ]
        audio = np.concatenate(parts)
        write_wav(out / f"{k}.wav", audio)
        print(f"candidate {k}: {len(audio) / SAMPLE_RATE:.1f}s in {time.time() - t0:.0f}s → {out / f'{k}.wav'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
