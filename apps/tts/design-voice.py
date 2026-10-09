"""Design the read-aloud voice once from a persona prompt (Breeze TTS 2 voice design).

  bun run py python apps/tts/design-voice.py [count]

Writes <count> candidates (default 3) to apps/tts/.voice/candidates/<k>.wav plus
the sentence they speak in apps/tts/.voice/candidates/reference.txt. Listen, then promote
the one you like:

  cp apps/tts/.voice/candidates/1.wav apps/tts/.voice/reference.wav
  cp apps/tts/.voice/candidates/reference.txt apps/tts/.voice/reference.txt
  bun run audio --upload-voice

Posts are plain clones of that clip (synth.py), which keeps the voice fixed
across paragraphs. Design is sampled, so candidates differ.
"""

import contextlib
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from wavfile import write_wav

MODEL = "mlx-community/Breeze-TTS-2-mlx-8bit"
SAMPLE_RATE = 24000
CFG_SCALE = 4  # the upstream voice-design default; needed for the prompt to take effect

PERSONA = (
    "A 25-year-old male software engineer from Chennai with a light Tamil-influenced "
    "Indian English accent, recording the audio version of his own blog post. Quiet "
    "confidence and a bit of dry humour. Natural conversational pace, slight emphasis "
    "on key terms, brief pauses between ideas."
)

# About 10 s spoken, long enough to anchor a clone and short enough to design fast.
SENTENCE = (
    "Hey there, if you are reading this in a desktop, press ctrl + shift + i and "
    "open console and paste the below code."
)


def main() -> int:
    from mlx_audio.tts import load

    count = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    out = Path(__file__).resolve().parent / ".voice" / "candidates"
    out.mkdir(parents=True, exist_ok=True)
    (out / "reference.txt").write_text(SENTENCE + "\n")
    with contextlib.redirect_stdout(sys.stderr):
        # Neither the real nn.Module type nor the fake's Model declares voice design's generate().
        model: Any = load(MODEL)
    for k in range(count):
        t0 = time.time()
        parts = [
            np.asarray(c.audio, dtype=np.float32).reshape(-1)
            for c in model.generate(text=SENTENCE, instruct=PERSONA, cfg_scale=CFG_SCALE)
        ]
        audio = np.concatenate(parts)
        write_wav(out / f"{k}.wav", audio, SAMPLE_RATE)
        print(
            f"candidate {k}: {len(audio) / SAMPLE_RATE:.1f}s in {time.time() - t0:.0f}s, wrote {out / f'{k}.wav'}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
