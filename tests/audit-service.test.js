const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EventApi,
  EventStore,
  EventTypes,
} = require("../src/core/event-engine.js");
const { AuditService } = require("../src/audit/auditService.js");

const TEST_DATE = "2026-09-08";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async getAll() {
    return Object.fromEntries(this.values);
  }

  async setItem(key, value) {
    this.values.set(key, value);
  }

  async removeItems(keys) {
    keys.forEach((key) => this.values.delete(key));
  }
}

function createHarness() {
  const persistence = new MemoryStorage();
  const eventStore = new EventStore(persistence);
  const eventApi = new EventApi(eventStore);
  const auditService = new AuditService({
    eventStore,
    persistence,
    now: () => new Date("2026-09-08T23:00:00.000Z"),
  });
  return { persistence, eventApi, auditService };
}

async function record(eventApi, type, metadata, minute) {
  const timestamp = new Date(2026, 8, 8, 12, minute, 0, 0).toISOString();
  return eventApi.record(
    type,
    metadata,
    "test",
    timestamp,
  );
}

test("calculates final mission completion state", async () => {
  const { eventApi, auditService } = createHarness();
  await record(eventApi, EventTypes.MISSION_COMPLETED, { missionId: "build" }, 0);
  await record(eventApi, EventTypes.MISSION_COMPLETED, { missionId: "move" }, 1);
  await record(
    eventApi,
    EventTypes.MISSION_UNCOMPLETED,
    { missionId: "recover" },
    2,
  );

  const audit = await auditService.generateDailyAudit(TEST_DATE);

  assert.equal(audit.missions.total, 3);
  assert.equal(audit.missions.completed, 2);
  assert.equal(audit.missions.completionRate, 0.67);
});

test("aggregates and ranks observed browser domains", async () => {
  const { eventApi, auditService } = createHarness();
  await record(
    eventApi,
    EventTypes.BROWSER_SITE_SESSION,
    { domain: "youtube.com", durationMs: 20 * 60 * 1000 },
    0,
  );
  await record(
    eventApi,
    EventTypes.BROWSER_SITE_SESSION,
    { domain: "youtube.com", durationMs: 22 * 60 * 1000 },
    1,
  );
  await record(
    eventApi,
    EventTypes.BROWSER_SITE_SESSION,
    { domain: "github.com", durationMs: 60 * 60 * 1000 },
    2,
  );

  const audit = await auditService.generateDailyAudit(TEST_DATE);

  assert.deepEqual(audit.browser.topDomains, [
    { domain: "github.com", durationMs: 60 * 60 * 1000 },
    { domain: "youtube.com", durationMs: 42 * 60 * 1000 },
  ]);
  assert.equal(audit.browser.totalObservedMs, 102 * 60 * 1000);
  assert.deepEqual(
    audit.patterns.find(({ type }) => type === "HIGH_DISTRACTION_TIME"),
    {
      type: "HIGH_DISTRACTION_TIME",
      severity: "info",
      domain: "youtube.com",
      durationMs: 42 * 60 * 1000,
    },
  );
});

test("returns an insufficient-data audit for an empty day", async () => {
  const { auditService } = createHarness();

  const audit = await auditService.generateDailyAudit(TEST_DATE);

  assert.equal(audit.verdict, "INSUFFICIENT_DATA");
  assert.equal(audit.missions.total, 0);
  assert.equal(audit.browser.totalObservedMs, 0);
  assert.deepEqual(audit.highlights, []);
  assert.deepEqual(audit.misses, []);
});

test("reports no mission activity when a plan exists without toggles", async () => {
  const { eventApi, auditService } = createHarness();
  await record(
    eventApi,
    EventTypes.COMMAND_CENTER_OPENED,
    {
      plannedMissions: [
        { missionId: "build" },
        { missionId: "move" },
        { missionId: "recover" },
      ],
    },
    0,
  );

  const audit = await auditService.generateDailyAudit(TEST_DATE);

  assert.equal(audit.missions.total, 3);
  assert.ok(
    audit.patterns.some(({ type }) => type === "NO_MISSION_ACTIVITY"),
  );
});

test("is reproducible from the same event stream and persists the result", async () => {
  const { eventApi, auditService } = createHarness();
  await record(eventApi, EventTypes.MOOD_SELECTED, { mood: "ENERGIZED" }, 0);
  await record(eventApi, EventTypes.MISSION_COMPLETED, { missionId: "build" }, 1);

  const first = await auditService.generateDailyAudit(TEST_DATE);
  const second = await auditService.generateDailyAudit(TEST_DATE);
  const { generatedAt: firstGeneratedAt, ...firstSubstantive } = first;
  const { generatedAt: secondGeneratedAt, ...secondSubstantive } = second;

  assert.deepEqual(firstSubstantive, secondSubstantive);
  assert.equal(firstGeneratedAt, secondGeneratedAt);
  assert.deepEqual(await auditService.getPersistedAudit(TEST_DATE), second);
});
