import os
import time
from pathlib import Path

from server.coach import default_fetch

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = int(os.environ.get("COACH_PORT") or 8787)
START_TIMEOUT_MS = 8000
POLL_INTERVAL_MS = 100


def health_url(host, port):
    return f"http://{host}:{port}/health"


def is_coach_listening(host=DEFAULT_HOST, port=DEFAULT_PORT, fetch_impl=None):
    if fetch_impl is None:
        fetch_impl = default_fetch
    if not callable(fetch_impl):
        return False

    try:
        response = fetch_impl(
            health_url(host, port),
            {"method": "GET", "timeout": 0.5},
        )
        if not getattr(response, "ok", False):
            return False
        body = response.json()
        return isinstance(body, dict) and body.get("ok") is True
    except Exception:
        return False


def wait_for_coach(
    host=DEFAULT_HOST,
    port=DEFAULT_PORT,
    fetch_impl=None,
    timeout_ms=START_TIMEOUT_MS,
    poll_interval_ms=POLL_INTERVAL_MS,
):
    started_at = time.time()
    timeout_s = timeout_ms / 1000
    poll_s = poll_interval_ms / 1000
    while time.time() - started_at < timeout_s:
        if is_coach_listening(host=host, port=port, fetch_impl=fetch_impl):
            return True
        time.sleep(poll_s)
    return is_coach_listening(host=host, port=port, fetch_impl=fetch_impl)


def start_coach_process(
    host=DEFAULT_HOST,
    port=DEFAULT_PORT,
    repo_root=None,
    python_path=None,
    log_path=None,
):
    import subprocess
    import sys

    repo_root = Path(repo_root or REPO_ROOT)
    python_path = python_path or sys.executable
    log_path = Path(log_path or (repo_root / "server" / ".generated" / "coach.log"))
    log_path.parent.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["COACH_HOST"] = host
    env["COACH_PORT"] = str(port)

    with open(log_path, "a", encoding="utf-8") as log_file:
        child = subprocess.Popen(
            [python_path, str(repo_root / "server" / "server.py")],
            cwd=str(repo_root),
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
            env=env,
        )
    return child.pid


def ensure_coach_running(
    host=DEFAULT_HOST,
    port=DEFAULT_PORT,
    fetch_impl=None,
    start_process=None,
    timeout_ms=START_TIMEOUT_MS,
    poll_interval_ms=POLL_INTERVAL_MS,
    **start_options,
):
    options = {
        "host": host,
        "port": port,
        "fetch_impl": fetch_impl,
        "timeout_ms": timeout_ms,
        "poll_interval_ms": poll_interval_ms,
    }
    if is_coach_listening(
        host=host,
        port=port,
        fetch_impl=fetch_impl,
    ):
        return {"ok": True, "alreadyRunning": True}

    starter = start_process or start_coach_process
    try:
        pid = starter(
            host=host,
            port=port,
            **{key: value for key, value in start_options.items() if key in {
                "repo_root",
                "python_path",
                "log_path",
            }},
        )
    except Exception as error:
        return {
            "ok": False,
            "code": "START_FAILED",
            "error": str(error) or "Could not start the local coach.",
        }

    if wait_for_coach(**options):
        return {"ok": True, "alreadyRunning": False, "pid": pid}

    return {
        "ok": False,
        "code": "START_TIMEOUT",
        "pid": pid,
        "error": "The local coach did not start in time.",
    }
