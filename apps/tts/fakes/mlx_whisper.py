from pathlib import Path


def transcribe(
    audio: str,
    *,
    path_or_hf_repo: str,
    language: str,
    word_timestamps: bool,
    initial_prompt: str | None,
    condition_on_previous_text: bool,
    temperature: float,
) -> dict[str, object]:
    heard = Path(f"{audio}.txt").read_text().split()
    if initial_prompt is not None and "echo" in Path(audio).name:
        heard = ["Thanks."]
    words = [{"word": word, "start": i * 0.5, "end": (i + 1) * 0.5} for i, word in enumerate(heard)]
    return {"segments": [{"words": words}]}
