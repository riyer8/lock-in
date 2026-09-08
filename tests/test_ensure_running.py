import json
import sys
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
if not sys.path or sys.path[0] != str(ROOT):
    sys.path.insert(0, str(ROOT))

from server.ensure_running import ensure_coach_running
from server.server import create_coach_server
from server.setup_coach import (
    collect_extension_ids_from_settings,
    find_lock_in_extension_ids,
    native_host_manifest,
    write_launcher,
)


class FakeResponse:
    def __init__(self, payload=None, ok=True):
        self.ok = ok
        self._payload = payload

    def json(self):
        return self._payload


class RunningServer:
    def __init__(self):
        self.server = create_coach_server()
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self.port

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class EnsureRunningTests(unittest.TestCase):
    def test_health_endpoint_reports_that_the_coach_is_running(self):
        with RunningServer() as port:
            with urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as response:
                body = json.loads(response.read().decode("utf-8"))
                self.assertEqual(response.status, 200)
                self.assertEqual(body["ok"], True)
                self.assertEqual(body["service"], "lock-in-coach")

    def test_ensure_coach_running_is_a_noop_when_health_endpoint_is_already_up(self):
        with RunningServer() as port:
            result = ensure_coach_running(port=port)
            self.assertEqual(result, {"ok": True, "alreadyRunning": True})

    def test_ensure_coach_running_starts_the_local_coach_process(self):
        attempts = {"count": 0}

        def fetch_impl(_url, options=None):
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise RuntimeError("down")
            return FakeResponse({"ok": True})

        result = ensure_coach_running(
            fetch_impl=fetch_impl,
            poll_interval_ms=1,
            start_process=lambda **_kwargs: 4242,
        )
        self.assertEqual(result, {"ok": True, "alreadyRunning": False, "pid": 4242})

    def test_setup_finds_unpacked_lock_in_extension_ids(self):
        repo_root = "/Users/ramya/Documents/GitHub/lock-in"
        ids = collect_extension_ids_from_settings(
            {
                "abcdefghijabcdefghijabcdefghijab": {"path": repo_root},
                "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn": {"path": "/tmp/other-extension"},
            },
            repo_root,
        )
        self.assertEqual(list(ids), ["abcdefghijabcdefghijabcdefghijab"])

    def test_setup_ignores_relative_extension_paths(self):
        ids = collect_extension_ids_from_settings(
            {"abcdefghijabcdefghijabcdefghijab": {"path": "."}},
            "/Users/ramya/Documents/GitHub/lock-in",
        )
        self.assertEqual(list(ids), [])

    def test_setup_can_read_an_extension_id_from_chrome_preferences(self):
        repo_root = "/Users/ramya/Documents/GitHub/lock-in"

        def read_file(_path):
            raise RuntimeError("missing")

        ids = find_lock_in_extension_ids(
            repo_root=repo_root,
            home="/tmp/not-a-real-home",
            env={"LOCK_IN_EXTENSION_ID": "abcdefghijklmnopabcdefghijklmnop"},
            read_file=read_file,
        )
        self.assertEqual(ids, ["abcdefghijklmnopabcdefghijklmnop"])

    def test_native_host_manifest_only_allows_the_unpacked_extension(self):
        manifest = native_host_manifest(
            extension_ids=["abcdefghijabcdefghijabcdefghijab"],
            launcher_path="/tmp/native-host-launcher.sh",
        )
        self.assertEqual(manifest["name"], "com.lockin.coach")
        self.assertEqual(
            manifest["allowed_origins"],
            ["chrome-extension://abcdefghijabcdefghijabcdefghijab/"],
        )

    def test_launcher_runs_the_python_native_host(self):
        launcher = ROOT / "tests" / ".tmp-native-host-launcher.sh"
        try:
            path = write_launcher(
                python_path="/usr/bin/python3",
                repo_root=ROOT,
                launcher_path=launcher,
            )
            text = Path(path).read_text(encoding="utf-8")
            self.assertIn("/usr/bin/python3", text)
            self.assertIn("native_host.py", text)
            self.assertNotIn("native-host.js", text)
        finally:
            if launcher.exists():
                launcher.unlink()


if __name__ == "__main__":
    unittest.main()
