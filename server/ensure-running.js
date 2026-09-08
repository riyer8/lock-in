"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = Number(process.env.COACH_PORT) || 8787;
const START_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function healthUrl(host, port) {
  return `http://${host}:${port}/health`;
}

async function isCoachListening(
  { host = DEFAULT_HOST, port = DEFAULT_PORT, fetchImpl = globalThis.fetch } = {},
) {
  if (typeof fetchImpl !== "function") {
    return false;
  }

  try {
    const response = await fetchImpl(healthUrl(host, port), {
      method: "GET",
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) {
      return false;
    }
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function waitForCoach(options = {}) {
  const timeoutMs = options.timeoutMs ?? START_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isCoachListening(options)) {
      return true;
    }
    await delay(options.pollIntervalMs ?? POLL_INTERVAL_MS);
  }

  return isCoachListening(options);
}

function startCoachProcess({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  repoRoot = REPO_ROOT,
  nodePath = process.execPath,
  logPath = path.join(repoRoot, "server", ".generated", "coach.log"),
} = {}) {
  const envFile = path.join(repoRoot, ".env");
  const args = [path.join(repoRoot, "server", "server.js")];
  try {
    fs.accessSync(envFile, fs.constants.R_OK);
    args.unshift(`--env-file=${envFile}`);
  } catch {
    // Start without a key file so health checks still work.
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logFd = fs.openSync(logPath, "a");
  try {
    const child = spawn(nodePath, args, {
      cwd: repoRoot,
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: {
        ...process.env,
        COACH_HOST: host,
        COACH_PORT: String(port),
      },
    });
    child.on("error", () => {});
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(logFd);
  }
}

async function ensureCoachRunning(options = {}) {
  if (await isCoachListening(options)) {
    return { ok: true, alreadyRunning: true };
  }

  const startProcess = options.startProcess ?? startCoachProcess;
  let pid;
  try {
    pid = startProcess(options);
  } catch (error) {
    return {
      ok: false,
      code: "START_FAILED",
      error: error?.message || "Could not start the local coach.",
    };
  }

  if (await waitForCoach(options)) {
    return { ok: true, alreadyRunning: false, pid };
  }

  return {
    ok: false,
    code: "START_TIMEOUT",
    pid,
    error: "The local coach did not start in time.",
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  REPO_ROOT,
  ensureCoachRunning,
  healthUrl,
  isCoachListening,
  startCoachProcess,
  waitForCoach,
};
