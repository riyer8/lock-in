const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EventApi,
  EventStore,
  EventTypes,
} = require("../src/core/event-engine.js");
const Goals = require("../src/core/goal-engine.js");
const AuditUtils = require("../src/audit/auditUtils.js");
const { AuditService } = require("../src/audit/auditService.js");
const PlanBuilder = require("../src/coach/plan-builder.js");
const Patterns = require("../src/audit/pattern-engine.js");

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

function goal(overrides = {}) {
  return {
    version: 1,
    id: "goal-primary",
    area: "Area A",
    outcome: "Reach a measurable outcome",
    why: "It supports a meaningful priority",
    metric: { baseline: 1, target: 10, current: 3, unit: "units" },
    deadline: "2030-06-30",
    frequencyPerWeek: 4,
    cue: { trigger: "After breakfast", time: "08:00", place: "Desk" },
    actions: {
      minimum: "Do the smallest step",
      standard: "Do the normal step",
      stretch: "Do the extended step",
    },
    obstacle: "Low energy",
    recoveryPlan: "Resume with the minimum action",
    reward: "Take a restorative break",
    status: "active",
    timestamps: {
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-02T00:00:00.000Z",
    },
    ...overrides,
  };
}

function historyEntry(overrides = {}) {
  return {
    missionId: "m1",
    goalId: "goal-primary",
    date: "2030-06-05",
    planned: true,
    completed: false,
    ...overrides,
  };
}

test("DAY_MISSED is a supported event type", async () => {
  assert.equal(EventTypes.DAY_MISSED, "DAY_MISSED");
  const persistence = new MemoryStorage();
  const eventApi = new EventApi(new EventStore(persistence));
  const event = await eventApi.record(
    EventTypes.DAY_MISSED,
    { dateKey: "2030-06-05" },
    "lock-in",
    new Date(2030, 5, 5, 12, 0, 0).toISOString(),
  );
  assert.equal(event.type, "DAY_MISSED");
  assert.equal(event.metadata.dateKey, "2030-06-05");
});

test("categorizeEvents buckets DAY_MISSED separately", () => {
  const events = [
    { type: "DAY_MISSED", metadata: { dateKey: "2030-06-05" } },
    { type: "MISSION_COMPLETED", metadata: {} },
  ];
  const categories = AuditUtils.categorizeEvents(events, EventTypes);
  assert.equal(categories.dayMissedEvents.length, 1);
  assert.equal(categories.missionEvents.length, 1);
});

test("determineVerdict returns MISSED_DAY for a missed day", () => {
  const base = {
    eventCount: 1,
    missions: { total: 0, activityCount: 0, completionRate: 0 },
    browser: { totalObservedMs: 0 },
    mood: { selected: null },
  };
  assert.equal(
    AuditUtils.determineVerdict({ ...base, dayMissed: true }),
    "MISSED_DAY",
  );
  assert.equal(
    AuditUtils.determineVerdict({ ...base, dayMissed: false }),
    "INSUFFICIENT_DATA",
  );
});

test("generateDailyAudit marks a silent day MISSED_DAY and still offers a takeaway", async () => {
  const persistence = new MemoryStorage();
  const eventStore = new EventStore(persistence);
  const eventApi = new EventApi(eventStore);
  const auditService = new AuditService({
    eventStore,
    persistence,
    now: () => new Date("2030-06-05T23:00:00.000Z"),
  });
  await eventApi.record(
    EventTypes.DAY_MISSED,
    { dateKey: "2030-06-05" },
    "lock-in",
    new Date(2030, 5, 5, 12, 0, 0).toISOString(),
  );
  const audit = await auditService.generateDailyAudit("2030-06-05");
  assert.equal(audit.verdict, "MISSED_DAY");
  assert.ok(
    typeof audit.guidance?.focus === "string" && audit.guidance.focus.length > 0,
    "expected a one-sentence takeaway",
  );
});

test("countConsecutiveMisses counts silent days as misses instead of resetting", () => {
  const history = [
    historyEntry({ goalId: "g1", missionId: "m1", date: "2030-06-04" }),
  ];
  const date = new Date(2030, 5, 6);
  assert.equal(
    Goals.countConsecutiveMisses(history, "g1", date, {
      missedDays: new Set(["2030-06-05"]),
    }),
    2,
  );
  assert.equal(Goals.countConsecutiveMisses(history, "g1", date), 0);
});

test("countConsecutiveMisses still exempts today while the day is in progress", () => {
  const history = [
    historyEntry({ goalId: "g1", missionId: "m1", date: "2030-06-05" }),
  ];
  const date = new Date(2030, 5, 6);
  assert.equal(
    Goals.countConsecutiveMisses(history, "g1", date, {
      missedDays: new Set(["2030-06-06"]),
    }),
    1,
  );
});

test("calculateFollowThrough reports when the streak ended on a silent day", () => {
  const history = [
    historyEntry({
      goalId: "g1",
      missionId: "m1",
      date: "2030-06-04",
      completed: true,
    }),
    historyEntry({
      goalId: "g1",
      missionId: "m2",
      date: "2030-06-05",
      completed: true,
    }),
  ];
  const date = new Date(2030, 5, 6);
  assert.deepEqual(
    Goals.calculateFollowThrough(history, date, {
      missedDays: new Set(["2030-06-03"]),
    }),
    { days: 2, ended: true },
  );
  assert.deepEqual(Goals.calculateFollowThrough(history, date), {
    days: 2,
    ended: false,
  });
});

test("calculateFollowThrough ends the streak on a planned-but-missed day", () => {
  const history = [
    historyEntry({ goalId: "g1", missionId: "m1", date: "2030-06-05" }),
  ];
  const date = new Date(2030, 5, 6);
  assert.deepEqual(Goals.calculateFollowThrough(history, date), {
    days: 0,
    ended: true,
  });
});

test("pattern detection counts silent days toward repeated misses", () => {
  const history = [
    historyEntry({ goalId: "g1", missionId: "m1", date: "2030-06-03" }),
    historyEntry({ goalId: "g1", missionId: "m2", date: "2030-06-04" }),
  ];
  const events = [
    {
      type: "DAY_MISSED",
      timestamp: new Date(2030, 5, 5, 12, 0, 0).toISOString(),
      metadata: { dateKey: "2030-06-05" },
    },
  ];
  const patterns = Patterns.detectMultiDayPatterns({
    history,
    events,
    goals: [goal({ id: "g1" })],
    asOf: new Date(2030, 5, 6),
  });
  const unrealistic = patterns.find(
    (pattern) => pattern.type === "PLAN_UNREALISTIC",
  );
  assert.ok(unrealistic, "expected a PLAN_UNREALISTIC pattern");
  assert.equal(unrealistic.goalId, "g1");
  assert.equal(unrealistic.missedCount, 3);
});

test("tryNextProposal turns a repeated-miss pattern into a concrete shrink proposal", () => {
  const proposal = PlanBuilder.tryNextProposal(
    {
      type: "PLAN_UNREALISTIC",
      goalId: "g1",
      missedCount: 3,
      copy: "Was the plan unrealistic?",
    },
    "Was the plan unrealistic?",
  );
  assert.equal(proposal.type, "shrink");
  assert.equal(proposal.changes, "Shrink tomorrow to minimum actions");
  assert.ok(!/\?\s*$/.test(proposal.changes), "must not be a question");
});

test("tryNextProposal turns a late-workday pattern into a concrete proposal", () => {
  const proposal = PlanBuilder.tryNextProposal(
    {
      type: "DEEP_WORK_AFTER_LATE_DAYS",
      copy: "Deep-work completion has dropped on days when the workday ran late.",
    },
    "Deep-work completion has dropped on days when the workday ran late.",
  );
  assert.equal(proposal.type, "protect-slot");
  assert.ok(!/\?\s*$/.test(proposal.changes), "must not be a question");
});

test("missionsFromNextAction never turns a diagnostic question into a mission", () => {
  const missions = PlanBuilder.missionsFromNextAction({
    nextAction: "Was the plan unrealistic?",
    fallbackMissions: [{ title: "Run 3x/week", category: "FITNESS" }],
    date: new Date(2030, 5, 7),
    proposal: { type: "protect-slot", reason: "Was the plan unrealistic?" },
  });
  assert.ok(
    missions.every((mission) => !/\?\s*$/.test(mission.title)),
    "no mission title may be a diagnostic question",
  );
  assert.equal(missions[0].title, "Run 3x/week");
});

test("applyAdaptationToPlan can force a minimum-difficulty shrink", () => {
  const goals = [
    goal({ id: "g1", area: "Area A", outcome: "Outcome one" }),
    goal({ id: "g2", area: "Area B", outcome: "Outcome two" }),
    goal({ id: "g3", area: "Area C", outcome: "Outcome three" }),
    goal({ id: "g4", area: "Area D", outcome: "Outcome four" }),
    goal({ id: "g5", area: "Area E", outcome: "Outcome five" }),
  ];
  const preserved = goals.map((item, index) => ({
    id: `2030-06-07:${item.id}`,
    goalId: item.id,
    title: item.outcome,
    category: item.area,
    priority: index === 0 ? "high" : "medium",
  }));
  const missions = PlanBuilder.applyAdaptationToPlan({
    proposed: [],
    preserved,
    goals,
    date: new Date(2030, 5, 7),
    recentOutcomes: [],
    proposal: { type: "shrink", changes: "Shrink tomorrow to minimum actions" },
    difficulty: "minimum",
  });
  assert.equal(missions.length, 3);
  assert.ok(
    missions.every(
      (mission) =>
        mission.source === "adapted-plan" && mission.adaptedFrom === "shrink",
    ),
  );
  assert.ok(
    missions.every((mission) => typeof mission.goalId === "string"),
    "shrunk plan keeps its goal links",
  );
});

test("selectDailyMissions caps at five instead of three", () => {
  const goals = ["a", "b", "c", "d", "e", "f"].map((suffix) =>
    goal({ id: `goal-${suffix}`, area: `Area ${suffix.toUpperCase()}` }),
  );
  const selected = Goals.selectDailyMissions(
    goals,
    [],
    [],
    "2030-06-03",
    9,
  );
  assert.equal(selected.length, 5);
});

test("planSize follows difficulty: minimum 3, standard 4, stretch 5", () => {
  assert.equal(PlanBuilder.planSize("minimum"), 3);
  assert.equal(PlanBuilder.planSize("standard"), 4);
  assert.equal(PlanBuilder.planSize("stretch"), 5);
});

test("buildLapseRecovery offers a calm, concrete minimum restart", () => {
  const recovery = Goals.buildLapseRecovery(goal({ id: "g1" }), {
    missedCount: 2,
    date: new Date(2030, 5, 5),
  });
  assert.equal(recovery.tone, "supportive");
  assert.ok(
    recovery.message.startsWith("Restart gently with:"),
    `unexpected message: ${recovery.message}`,
  );
  assert.ok(
    recovery.nextAction && recovery.nextAction.length > 0,
    "a recovery action must be usable as a mission title",
  );
});
