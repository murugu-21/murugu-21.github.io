from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 24000
MS_PER_CHAR = 10
SAMPLES_PER_CHAR = SAMPLE_RATE * MS_PER_CHAR // 1000


@dataclass
class Result:
    audio: np.ndarray
    sample_rate: int


class Model:
    def generate(
        self,
        *,
        text: str,
        instruct: str | None = None,
        ref_audio: str | None = None,
        ref_text: str | None = None,
        cfg_scale: float | None = None,
        max_tokens: int = 750,
    ) -> Iterator[Result]:
        print(f"generating {len(text)} characters")
        if "[raise]" in text:
            raise RuntimeError("fake model failure")
        if "[silent]" in text:
            return
        rate = 22050 if "[rate]" in text else SAMPLE_RATE
        total = len(text) * SAMPLES_PER_CHAR
        for size in (total // 2, total - total // 2):
            yield Result(np.full(size, 0.5, dtype=np.float32), rate)


def load(model: str) -> Model:
    print(f"fetching {model}")
    return Model()
