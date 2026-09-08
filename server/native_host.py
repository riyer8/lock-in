import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from server.ensure_running import ensure_coach_running


def read_native_message():
    header = sys.stdin.buffer.read(4)
    if not header:
        return {"action": "ensureRunning"}
    if len(header) < 4:
        raise ValueError("Native host message ended early.")

    length = struct.unpack("<I", header)[0]
    if length <= 0 or length > 1024 * 1024:
        raise ValueError("Native host message is invalid.")

    body = sys.stdin.buffer.read(length)
    if len(body) < length:
        raise ValueError("Native host message ended early.")

    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError("Native host message must be JSON.") from error


def write_native_message(value):
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    header = struct.pack("<I", len(payload))
    sys.stdout.buffer.write(header + payload)
    sys.stdout.buffer.flush()


def main():
    try:
        message = read_native_message()
        action = message.get("action") if isinstance(message, dict) else None
        if action and action != "ensureRunning":
            write_native_message(
                {
                    "ok": False,
                    "code": "UNSUPPORTED_ACTION",
                    "error": "Unsupported native host action.",
                }
            )
            return 0

        write_native_message(ensure_coach_running())
        return 0
    except Exception as error:
        try:
            write_native_message(
                {
                    "ok": False,
                    "code": "NATIVE_HOST_ERROR",
                    "error": str(error) or "Native host failed.",
                }
            )
        except Exception:
            print(error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
