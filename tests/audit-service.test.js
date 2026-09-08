const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EventApi,
  EventStore,
  EventTypes,
} = require("../src/core/event-engine.js");
const { AuditService } = require("../src/audit/auditService.js");

const TEST_DATE = "2026-09-10";

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
    now: () => new Date("2026-09-10T23:00:00.000Z"),
  });
  return { persistence, eventApi, auditService };
}

async function record(eventApi, type, metadata, minute) {
  const timestamp = new Date(2026, 8, 10, 12, minute, 0, 0).toISOString();
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
  assert.deepEqual(audit.guidance, {
    focus: "Decide whether the unfinished mission is worth carrying forward.",
    addMore: "Add a quick mood check-in next time for more context.",
    makeItInteresting:
      "Choose one small novelty next time: a new place, route, recipe, playlist, or activity.",
  });
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

test("produces every populated verdict at its completion threshold", async () => {
  const cases = [
    { completed: 5, verdict: "STRONG" },
    { completed: 3, verdict: "SOLID" },
    { completed: 2, verdict: "MIXED" },
    { completed: 1, verdict: "NEEDS_ATTENTION" },
  ];

  for (const { completed, verdict } of cases) {
    const { eventApi, auditService } = createHarness();
    const plannedMissions = Array.from({ length: 5 }, (_, index) => ({
      missionId: `mission-${index}`,
    }));
    await record(
      eventApi,
      EventTypes.COMMAND_CENTER_OPENED,
      { plannedMissions },
      0,
    );
    for (let index = 0; index < completed; index += 1) {
      await record(
        eventApi,
        EventTypes.MISSION_COMPLETED,
        { missionId: `mission-${index}` },
        index + 1,
      );
    }

    const audit = await auditService.generateDailyAudit(TEST_DATE);
    assert.equal(audit.verdict, verdict);
  }
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

test("reports goal action levels and milestone preparation", async () => {
  const { eventApi, auditService } = createHarness();
  await record(
    eventApi,
    EventTypes.MISSION_COMPLETED,
    {
      missionId: "goal-action",
      goalId: "goal-health",
      milestoneTaskId: "move-window",
      level: "minimum",
    },
    0,
  );
  await record(
    eventApi,
    EventTypes.MILESTONE_TASK_COMPLETED,
    { milestoneTaskId: "move-window" },
    1,
  );
  await record(
    eventApi,
    EventTypes.WEEKLY_REVIEW_COMPLETED,
    { goalId: "goal-health" },
    2,
  );

  const audit = await auditService.generateDailyAudit(TEST_DATE);

  assert.equal(audit.schemaVersion, 4);
  assert.deepEqual(audit.missions.levels, {
    minimum: 1,
    standard: 0,
    stretch: 0,
  });
  assert.deepEqual(audit.missions.byGoal, { "goal-health": 1 });
  assert.equal(audit.missions.milestoneTasksCompleted, 1);
  assert.equal(audit.behavior.weeklyReviewCompleted, true);
  assert.ok(audit.highlights.some((item) => item.includes("minimum-version")));
});

test("uses the latest Today plan instead of every mission id from the day", async () => {
  const { eventApi, auditService } = createHarness();
  await record(
    eventApi,
    EventTypes.COMMAND_CENTER_OPENED,
    {
      plannedMissions: [
        { missionId: "old-a", title: "Old A", goalId: "goal-1" },
        { missionId: "old-b", title: "Old B", goalId: "goal-2" },
        { missionId: "old-c", title: "Old C", goalId: "goal-3" },
      ],
    },
    0,
  );
  await record(
    eventApi,
    EventTypes.COMMAND_CENTER_OPENED,
    {
      plannedMissions: [
        { missionId: "now-a", title: "Run 3x/week", goalId: "goal-1" },
        { missionId: "now-b", title: "Deep work", goalId: "goal-2" },
        { missionId: "now-c", title: "Recover", goalId: "goal-3" },
      ],
    },
    1,
  );
  await record(
    eventApi,
    EventTypes.MISSION_COMPLETED,
    { missionId: "old-a", title: "Run 3x/week", goalId: "goal-1" },
    2,
  );
  await record(
    eventApi,
    EventTypes.MISSION_COMPLETED,
    { missionId: "now-b", title: "Deep work", goalId: "goal-2" },
    3,
  );

  const audit = await auditService.generateDailyAudit(TEST_DATE);
  assert.equal(audit.missions.total, 3);
  assert.equal(audit.missions.completed, 2);
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
