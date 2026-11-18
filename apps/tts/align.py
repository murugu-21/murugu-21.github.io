import json
import sys

from protocol import emit, reserve_stdout_for_protocol

MODEL = "17slever17/Qwen3-ForcedAligner-Ultra"
REVISION = "765dc1d714e4c80196782a5df5bfbcb3e1416736"


def main() -> int:
    reserve_stdout_for_protocol()
    from mlx_audio.stt import load

    model = load(MODEL, revision=REVISION)
    for line in sys.stdin:
        line = line.strip()
        if line == "quit":
            break
        if not line:
            continue
        job = json.loads(line)
        try:
            result = model.generate(audio=job["wav"], text=job["text"], language="English")
            words = [
                {"word": item.text, "start": float(item.start_time), "end": float(item.end_time)}
                for item in result
            ]
            emit({"id": job["id"], "words": words})
        except Exception as exc:  # noqa: BLE001  # report and keep serving
            emit({"id": job["id"], "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
