import os
import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if not sys.path or sys.path[0] != str(ROOT):
    sys.path.insert(0, str(ROOT))

from server.envfile import load_env_file


class EnvFileTests(unittest.TestCase):
    def test_loads_keys_without_overriding_existing_env(self):
        os.environ["LOCK_IN_ENV_TEST_KEEP"] = "from-env"
        os.environ.pop("LOCK_IN_ENV_TEST_NEW", None)
        handle = tempfile.NamedTemporaryFile("w", delete=False, encoding="utf-8")
        try:
            handle.write("LOCK_IN_ENV_TEST_KEEP=from-file\nLOCK_IN_ENV_TEST_NEW=added\n# comment\n")
            handle.close()
            load_env_file(handle.name)
            self.assertEqual(os.environ["LOCK_IN_ENV_TEST_KEEP"], "from-env")
            self.assertEqual(os.environ["LOCK_IN_ENV_TEST_NEW"], "added")
        finally:
            os.environ.pop("LOCK_IN_ENV_TEST_KEEP", None)
            os.environ.pop("LOCK_IN_ENV_TEST_NEW", None)
            Path(handle.name).unlink()

    def test_missing_env_file_is_ignored(self):
        load_env_file(ROOT / "does-not-exist.env")


if __name__ == "__main__":
    unittest.main()
