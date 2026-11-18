import json
import sys

_protocol = sys.stdout


def reserve_stdout_for_protocol() -> None:
    global _protocol
    _protocol = sys.stdout
    sys.stdout = sys.stderr


def emit(obj: dict[str, object]) -> None:
    _protocol.write(json.dumps(obj) + "\n")
    _protocol.flush()
