import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if not sys.path or sys.path[0] != str(ROOT):
    sys.path.insert(0, str(ROOT))

from server.ensure_running import REPO_ROOT, ensure_coach_running

NATIVE_HOST_NAME = "com.lockin.coach"
GENERATED_DIR = REPO_ROOT / "server" / ".generated"
LAUNCHER_PATH = GENERATED_DIR / "native-host-launcher.sh"
EXTENSION_ID = re.compile(r"^[a-p]{32}$")

BROWSER_HOST_DIRS = [
    ("Google Chrome", Path("Library") / "Application Support" / "Google" / "Chrome" / "NativeMessagingHosts"),
    ("Google Chrome Canary", Path("Library") / "Application Support" / "Google" / "Chrome Canary" / "NativeMessagingHosts"),
    ("Chromium", Path("Library") / "Application Support" / "Chromium" / "NativeMessagingHosts"),
    ("Microsoft Edge", Path("Library") / "Application Support" / "Microsoft Edge" / "NativeMessagingHosts"),
    ("Brave", Path("Library") / "Application Support" / "BraveSoftware" / "Brave-Browser" / "NativeMessagingHosts"),
    ("Arc", Path("Library") / "Application Support" / "Arc" / "User Data" / "NativeMessagingHosts"),
]

BROWSER_DATA_ROOTS = [
    Path("Library") / "Application Support" / "Google" / "Chrome",
    Path("Library") / "Application Support" / "Google" / "Chrome Canary",
    Path("Library") / "Application Support" / "Chromium",
    Path("Library") / "Application Support" / "Microsoft Edge",
    Path("Library") / "Application Support" / "BraveSoftware" / "Brave-Browser",
    Path("Library") / "Application Support" / "Arc" / "User Data",
]


def list_preference_files(home, read_dir=None):
    home_path = Path(home)
    files = []
    for relative_root in BROWSER_DATA_ROOTS:
        root = home_path / relative_root
        try:
            entries = read_dir(root) if read_dir is not None else list(root.iterdir())
        except OSError:
            continue
        for entry in entries:
            name = entry.name if hasattr(entry, "name") else str(entry)
            if hasattr(entry, "is_dir"):
                is_directory = entry.is_dir()
            elif hasattr(entry, "isDirectory"):
                is_directory = entry.isDirectory()
            else:
                is_directory = True
            if not is_directory:
                continue
            if name != "Default" and not str(name).startswith("Profile "):
                continue
            files.append(str(root / name / "Preferences"))
            files.append(str(root / name / "Secure Preferences"))
    return files


def collect_extension_ids_from_settings(settings, repo_root):
    ids = set()
    if not isinstance(settings, dict):
        return ids

    normalized_repo = os.path.abspath(repo_root)
    for extension_id, info in settings.items():
        if not EXTENSION_ID.match(str(extension_id)):
            continue
        path_value = info.get("path") if isinstance(info, dict) else None
        if not isinstance(path_value, str):
            continue
        if not os.path.isabs(path_value):
            continue
        if os.path.abspath(path_value) == normalized_repo:
            ids.add(extension_id)
    return ids


def find_lock_in_extension_ids(
    repo_root=None,
    home=None,
    env=None,
    read_file=None,
    preference_files=None,
):
    ids = set()
    repo_root = repo_root or REPO_ROOT
    home = home if home is not None else str(Path.home())
    env = env if env is not None else os.environ
    configured = str(env.get("LOCK_IN_EXTENSION_ID") or "").strip()
    if configured and EXTENSION_ID.match(configured):
        ids.add(configured)

    files = preference_files
    if files is None:
        files = list_preference_files(home)

    for file_path in files:
        try:
            text = (
                read_file(file_path)
                if read_file
                else Path(file_path).read_text(encoding="utf-8")
            )
        except Exception:
            continue
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            continue
        extensions = parsed.get("extensions") if isinstance(parsed, dict) else None
        settings = extensions.get("settings") if isinstance(extensions, dict) else None
        ids.update(collect_extension_ids_from_settings(settings, repo_root))

    return list(ids)


def write_launcher(python_path=None, repo_root=None, launcher_path=None):
    python_path = python_path or sys.executable
    repo_root = Path(repo_root or REPO_ROOT)
    launcher_path = Path(launcher_path or LAUNCHER_PATH)
    launcher_path.parent.mkdir(parents=True, exist_ok=True)
    native_host = repo_root / "server" / "native_host.py"
    script = "\n".join(
        [
            "#!/bin/sh",
            f'exec "{python_path}" "{native_host}"',
            "",
        ]
    )
    launcher_path.write_text(script, encoding="utf-8")
    os.chmod(launcher_path, 0o755)
    return str(launcher_path)


def native_host_manifest(extension_ids, launcher_path=None):
    launcher_path = str(launcher_path or LAUNCHER_PATH)
    return {
        "name": NATIVE_HOST_NAME,
        "description": "LOCK IN AI Coach launcher",
        "path": launcher_path,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/" for extension_id in extension_ids
        ],
    }


def install_native_host_manifests(extension_ids, home=None, launcher_path=None):
    home = Path(home if home is not None else Path.home())
    launcher_path = launcher_path or LAUNCHER_PATH
    manifest = native_host_manifest(extension_ids, launcher_path=launcher_path)
    installed = []

    for browser, relative_dir in BROWSER_HOST_DIRS:
        directory = home / relative_dir
        parent = directory.parent
        is_chrome = browser == "Google Chrome"
        if not is_chrome and not parent.exists():
            continue
        directory.mkdir(parents=True, exist_ok=True)
        manifest_path = directory / f"{NATIVE_HOST_NAME}.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        installed.append({"browser": browser, "manifestPath": str(manifest_path)})

    return installed


def main():
    extension_ids = find_lock_in_extension_ids()
    launcher_path = write_launcher()
    installed = []

    if extension_ids:
        installed = install_native_host_manifests(
            extension_ids,
            launcher_path=launcher_path,
        )

    running = ensure_coach_running()

    print("LOCK IN AI Coach setup")
    print(f"Python: {sys.executable}")
    if not extension_ids:
        print(
            "Could not find the unpacked LOCK IN extension yet. Load it in Chrome, then run npm run setup-coach again so Ask Coach can start the backend after reboot."
        )
    else:
        print(f"Extension ID: {', '.join(extension_ids)}")
        for item in installed:
            print(
                f"Installed native host for {item['browser']}: {item['manifestPath']}"
            )

    if running.get("ok"):
        print(
            "Coach backend is already running."
            if running.get("alreadyRunning")
            else "Coach backend is running now."
        )
    else:
        print(f"Could not start the backend: {running.get('error')}")
        sys.exit(1)

    print("Reload LOCK IN on chrome://extensions, then click Ask Coach.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(error, file=sys.stderr)
        sys.exit(1)
