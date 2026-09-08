"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { ensureCoachRunning, REPO_ROOT } = require("./ensure-running.js");

const NATIVE_HOST_NAME = "com.lockin.coach";
const GENERATED_DIR = path.join(REPO_ROOT, "server", ".generated");
const LAUNCHER_PATH = path.join(GENERATED_DIR, "native-host-launcher.sh");

const BROWSER_HOST_DIRS = [
  ["Google Chrome", path.join("Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")],
  ["Google Chrome Canary", path.join("Library", "Application Support", "Google", "Chrome Canary", "NativeMessagingHosts")],
  ["Chromium", path.join("Library", "Application Support", "Chromium", "NativeMessagingHosts")],
  ["Microsoft Edge", path.join("Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts")],
  ["Brave", path.join("Library", "Application Support", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts")],
  ["Arc", path.join("Library", "Application Support", "Arc", "User Data", "NativeMessagingHosts")],
];

const BROWSER_DATA_ROOTS = [
  path.join("Library", "Application Support", "Google", "Chrome"),
  path.join("Library", "Application Support", "Google", "Chrome Canary"),
  path.join("Library", "Application Support", "Chromium"),
  path.join("Library", "Application Support", "Microsoft Edge"),
  path.join("Library", "Application Support", "BraveSoftware", "Brave-Browser"),
  path.join("Library", "Application Support", "Arc", "User Data"),
];

function listPreferenceFiles(home, readDir = fs.readdirSync) {
  const files = [];
  for (const relativeRoot of BROWSER_DATA_ROOTS) {
    const root = path.join(home, relativeRoot);
    let entries;
    try {
      entries = readDir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (entry.name !== "Default" && !entry.name.startsWith("Profile ")) {
        continue;
      }
      files.push(
        path.join(root, entry.name, "Preferences"),
        path.join(root, entry.name, "Secure Preferences"),
      );
    }
  }
  return files;
}

function collectExtensionIdsFromSettings(settings, repoRoot) {
  const ids = new Set();
  if (!settings || typeof settings !== "object") {
    return ids;
  }

  const normalizedRepo = path.resolve(repoRoot);
  for (const [id, info] of Object.entries(settings)) {
    if (!/^[a-p]{32}$/.test(id) || typeof info?.path !== "string") {
      continue;
    }
    if (!path.isAbsolute(info.path)) {
      continue;
    }
    const extensionPath = path.resolve(info.path);
    if (extensionPath === normalizedRepo) {
      ids.add(id);
    }
  }
  return ids;
}

function findLockInExtensionIds({
  repoRoot = REPO_ROOT,
  home = os.homedir(),
  env = process.env,
  readFile = (filePath) => fs.readFileSync(filePath, "utf8"),
  preferenceFiles,
} = {}) {
  const ids = new Set();
  const configured = env.LOCK_IN_EXTENSION_ID?.trim();
  if (configured && /^[a-p]{32}$/.test(configured)) {
    ids.add(configured);
  }

  for (const filePath of preferenceFiles ?? listPreferenceFiles(home)) {
    let text;
    try {
      text = readFile(filePath);
    } catch {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    for (const id of collectExtensionIdsFromSettings(
      parsed?.extensions?.settings,
      repoRoot,
    )) {
      ids.add(id);
    }
  }

  return [...ids];
}

function writeLauncher({
  nodePath = process.execPath,
  repoRoot = REPO_ROOT,
  launcherPath = LAUNCHER_PATH,
} = {}) {
  fs.mkdirSync(path.dirname(launcherPath), { recursive: true });
  const script = [
    "#!/bin/sh",
    `exec "${nodePath}" "${path.join(repoRoot, "server", "native-host.js")}"`,
    "",
  ].join("\n");
  fs.writeFileSync(launcherPath, script, { mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);
  return launcherPath;
}

function nativeHostManifest({
  extensionIds,
  launcherPath = LAUNCHER_PATH,
} = {}) {
  return {
    name: NATIVE_HOST_NAME,
    description: "LOCK IN AI Coach launcher",
    path: launcherPath,
    type: "stdio",
    allowed_origins: extensionIds.map((id) => `chrome-extension://${id}/`),
  };
}

function installNativeHostManifests({
  extensionIds,
  home = os.homedir(),
  launcherPath = LAUNCHER_PATH,
} = {}) {
  const manifest = nativeHostManifest({ extensionIds, launcherPath });
  const installed = [];

  for (const [browser, relativeDir] of BROWSER_HOST_DIRS) {
    const directory = path.join(home, relativeDir);
    const parent = path.dirname(directory);
    const isChrome = browser === "Google Chrome";
    if (!isChrome && !fs.existsSync(parent)) {
      continue;
    }

    fs.mkdirSync(directory, { recursive: true });
    const manifestPath = path.join(directory, `${NATIVE_HOST_NAME}.json`);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    installed.push({ browser, manifestPath });
  }

  return installed;
}

async function main() {
  const extensionIds = findLockInExtensionIds();
  const launcherPath = writeLauncher();
  let installed = [];

  if (extensionIds.length > 0) {
    installed = installNativeHostManifests({ extensionIds, launcherPath });
  }

  const running = await ensureCoachRunning();

  console.log("LOCK IN AI Coach setup");
  console.log(`Node: ${process.execPath}`);
  if (extensionIds.length === 0) {
    console.log(
      "Could not find the unpacked LOCK IN extension yet. Load it in Chrome, then run npm run setup-coach again so Ask Coach can start the backend after reboot.",
    );
  } else {
    console.log(`Extension ID: ${extensionIds.join(", ")}`);
    for (const { browser, manifestPath } of installed) {
      console.log(`Installed native host for ${browser}: ${manifestPath}`);
    }
  }

  if (running.ok) {
    console.log(
      running.alreadyRunning
        ? "Coach backend is already running."
        : "Coach backend is running now.",
    );
  } else {
    console.log(`Could not start the backend: ${running.error}`);
    process.exitCode = 1;
  }

  console.log("Reload LOCK IN on chrome://extensions, then click Ask Coach.");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  NATIVE_HOST_NAME,
  collectExtensionIdsFromSettings,
  findLockInExtensionIds,
  installNativeHostManifests,
  listPreferenceFiles,
  nativeHostManifest,
  writeLauncher,
};
