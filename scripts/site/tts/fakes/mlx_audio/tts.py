from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

SAMPLES_PER_CHAR = 240  # 10 ms at 24 kHz


@dataclass
class Result:
    audio: np.ndarray
    sample_rate: int


class Model:
    def generate(
        self, *, text: str, ref_audio: str, ref_text: str, max_tokens: int
    ) -> Iterator[Result]:
        print(f"generating {len(text)} characters")
        if "[raise]" in text:
            raise RuntimeError("fake model failure")
        if "[silent]" in text:
            return
        rate = 22050 if "[rate]" in text else 24000
        total = len(text) * SAMPLES_PER_CHAR
        for size in (total // 2, total - total // 2):
            yield Result(np.full(size, 0.5, dtype=np.float32), rate)


def load(model: str) -> Model:
    print(f"fetching {model}")
    return Model()
