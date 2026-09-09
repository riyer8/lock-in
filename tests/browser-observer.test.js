const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BrowserObserver,
  calculateSessionDuration,
  getBrowserSessionsForDate,
  getBrowserTimeByDomain,
  getBrowserDaySummaries,
  getHostnameFromUrl,
} = require("../src/observer/browser-observer.js");

test("extracts only trackable hostnames", () => {
  assert.equal(
    getHostnameFromUrl("https://www.youtube.com/watch?v=x"),
    "youtube.com",
  );
  assert.equal(getHostnameFromUrl("https://github.com/foo/bar"), "github.com");
  assert.equal(
    getHostnameFromUrl("https://docs.google.com/document/x"),
    "docs.google.com",
  );
  assert.equal(getHostnameFromUrl("chrome://settings"), null);
  assert.equal(getHostnameFromUrl("chrome-extension://example/newtab.html"), null);
  assert.equal(getHostnameFromUrl("about:blank"), null);
});

test("calculates active session duration", () => {
  assert.equal(
    calculateSessionDuration(
      "2026-09-07T10:00:00.000Z",
      "2026-09-07T10:42:30.000Z",
    ),
    2550000,
  );
});

test("aggregates requested-date browser time by domain", () => {
  const events = [
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: "2026-09-07T10:20:00.000Z",
      metadata: { domain: "github.com", durationMs: 1200000 },
    },
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: "2026-09-07T11:00:00.000Z",
      metadata: { domain: "youtube.com", durationMs: 600000 },
    },
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: "2026-09-07T12:00:00.000Z",
      metadata: { domain: "github.com", durationMs: 1800000 },
    },
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: "2026-09-10T10:00:00.000Z",
      metadata: { domain: "reddit.com", durationMs: 9000000 },
    },
  ];
  const requestedDate = new Date("2026-09-07T12:00:00");

  assert.equal(getBrowserSessionsForDate(events, requestedDate).length, 3);
  assert.deepEqual(getBrowserTimeByDomain(events, requestedDate), [
    { domain: "github.com", durationMs: 3000000 },
    { domain: "youtube.com", durationMs: 600000 },
  ]);
});

test("summarizes browser time for recent local days", () => {
  const asOf = new Date(2026, 8, 9, 18, 0, 0);
  const events = [
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: new Date(2026, 8, 9, 10, 0, 0).toISOString(),
      metadata: { domain: "github.com", durationMs: 3600000 },
    },
    {
      type: "BROWSER_SITE_SESSION",
      timestamp: new Date(2026, 8, 8, 11, 0, 0).toISOString(),
      metadata: { domain: "youtube.com", durationMs: 1800000 },
    },
  ];
  const days = getBrowserDaySummaries(events, asOf, 3);
  assert.equal(days.length, 3);
  assert.equal(days[0].dateKey, "2026-09-09");
  assert.equal(days[0].topDomain, "github.com");
  assert.equal(days[0].totalMs, 3600000);
  assert.equal(days[1].dateKey, "2026-09-08");
  assert.equal(days[1].topDomain, "youtube.com");
  assert.equal(days[2].totalMs, 0);
  assert.equal(days[2].topDomain, "");
});

test("records one completed session when Chrome loses focus", async () => {
  let now = new Date("2026-09-07T10:00:00.000Z");
  let persistedSession = null;
  const recordedEvents = [];
  const tab = {
    id: 1,
    windowId: 10,
    active: true,
    incognito: false,
    url: "https://github.com/lock-in",
  };
  const observer = new BrowserObserver({
    tabs: {
      async query() {
        return [tab];
      },
      async get() {
        return tab;
      },
    },
    windows: {
      WINDOW_ID_NONE: -1,
      async getLastFocused() {
        return { id: 10, focused: true };
      },
      async get() {
        return { id: 10, focused: true };
      },
    },
    eventApi: {
      async record(type, metadata, source, timestamp) {
        recordedEvents.push({ type, metadata, source, timestamp });
      },
    },
    stateStore: {
      async get() {
        return persistedSession;
      },
      async set(session) {
        persistedSession = session;
      },
      async clear() {
        persistedSession = null;
      },
    },
    eventTypes: { BROWSER_SITE_SESSION: "BROWSER_SITE_SESSION" },
    now: () => now,
  });

  await observer.initialize();
  await observer.handleTabUpdated(1, { url: tab.url }, tab);
  now = new Date("2026-09-07T10:42:30.000Z");
  await observer.handleWindowFocusChanged(-1);

  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].metadata.domain, "github.com");
  assert.equal(recordedEvents[0].metadata.durationMs, 2550000);
  assert.equal(recordedEvents[0].source, "browser");
  assert.equal(persistedSession, null);
});
