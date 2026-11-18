import re
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ForcedAlignItem:
    text: str
    start_time: float
    end_time: float


@dataclass(frozen=True)
class ForcedAlignResult:
    items: list[ForcedAlignItem]

    def __iter__(self) -> Iterator[ForcedAlignItem]:
        return iter(self.items)


class Model:
    def generate(
        self, *, audio: str, text: str, language: str = "English", **kwargs: Any
    ) -> ForcedAlignResult:
        if not Path(audio).exists():
            raise FileNotFoundError(audio)
        cleaned = (re.sub(r"[^\w']|_", "", token) for token in text.split())
        words = [word for word in cleaned if word]
        return ForcedAlignResult(
            [ForcedAlignItem(word, i * 0.5, (i + 1) * 0.5) for i, word in enumerate(words)]
        )


def load(model_path: str, lazy: bool = False, strict: bool = False, **kwargs: Any) -> Model:
    if "revision" not in kwargs:
        raise ValueError(f"align.py must pin a revision of {model_path}")
    print(f"fetching {model_path}@{kwargs['revision']}")
    return Model()
