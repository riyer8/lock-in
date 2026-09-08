const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureCoachRunning } = require("../server/ensure-running.js");
const {
  collectExtensionIdsFromSettings,
  findLockInExtensionIds,
  nativeHostManifest,
} = require("../server/setup-coach.js");
const { createCoachServer } = require("../server/server.js");

test("health endpoint reports that the coach is running", async () => {
  const server = createCoachServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "lock-in-coach");
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("ensureCoachRunning is a no-op when the health endpoint is already up", async () => {
  const server = createCoachServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const result = await ensureCoachRunning({ port });
    assert.deepEqual(result, { ok: true, alreadyRunning: true });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("ensureCoachRunning starts the local coach process", async () => {
  let attempts = 0;
  const fetchImpl = async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error("down");
    }
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  const result = await ensureCoachRunning({
    fetchImpl,
    pollIntervalMs: 1,
    startProcess() {
      return 4242;
    },
  });

  assert.deepEqual(result, { ok: true, alreadyRunning: false, pid: 4242 });
});

test("setup finds unpacked LOCK IN extension IDs", () => {
  const repoRoot = "/Users/ramya/Documents/GitHub/lock-in";
  const ids = collectExtensionIdsFromSettings(
    {
      abcdefghijabcdefghijabcdefghijab: {
        path: repoRoot,
      },
      nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn: {
        path: "/tmp/other-extension",
      },
    },
    repoRoot,
  );

  assert.deepEqual([...ids], ["abcdefghijabcdefghijabcdefghijab"]);
});

test("setup ignores relative extension paths", () => {
  const ids = collectExtensionIdsFromSettings(
    {
      abcdefghijabcdefghijabcdefghijab: {
        path: ".",
      },
    },
    "/Users/ramya/Documents/GitHub/lock-in",
  );

  assert.deepEqual([...ids], []);
});

test("setup can read an extension ID from Chrome preferences", () => {
  const repoRoot = "/Users/ramya/Documents/GitHub/lock-in";
  const ids = findLockInExtensionIds({
    repoRoot,
    home: "/tmp/not-a-real-home",
    env: { LOCK_IN_EXTENSION_ID: "abcdefghijklmnopabcdefghijklmnop" },
    readFile() {
      throw new Error("missing");
    },
  });

  assert.deepEqual(ids, ["abcdefghijklmnopabcdefghijklmnop"]);
});

test("native host manifest only allows the unpacked extension", () => {
  const manifest = nativeHostManifest({
    extensionIds: ["abcdefghijabcdefghijabcdefghijab"],
    launcherPath: "/tmp/native-host-launcher.sh",
  });

  assert.equal(manifest.name, "com.lockin.coach");
  assert.deepEqual(manifest.allowed_origins, [
    "chrome-extension://abcdefghijabcdefghijabcdefghijab/",
  ]);
});
