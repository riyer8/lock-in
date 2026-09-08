const test = require("node:test");
const assert = require("node:assert/strict");

const Goals = require("../src/core/goal-engine.js");

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

test("normalizes a versioned goal without mutating the input", () => {
  const input = goal({
    area: "  Area A  ",
    metric: { baseline: "2", target: "8", current: "3", unit: " reps " },
    frequencyPerWeek: 99,
    deadline: "2030-02-03T23:00:00",
  });
  const snapshot = structuredClone(input);
  const normalized = Goals.normalizeGoalRecord(input, "2030-01-05T12:00:00Z");

  assert.deepEqual(input, snapshot);
  assert.equal(normalized.version, Goals.GOAL_VERSION);
  assert.equal(normalized.area, "Area A");
  assert.deepEqual(normalized.metric, {
    baseline: 2,
    target: 8,
    current: 3,
    unit: "reps",
  });
  assert.equal(normalized.frequencyPerWeek, 7);
  assert.equal(normalized.deadline, "2030-02-03");
  assert.deepEqual(Object.keys(normalized.actions), ["minimum", "standard", "stretch"]);
});

test("validates required goal fields and calculates SMART completeness", () => {
  const complete = goal();
  const validation = Goals.validateGoalRecord(complete);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);

  const incomplete = {
    ...complete,
    why: "",
    metric: { baseline: 1, target: 1, current: 1, unit: "" },
    deadline: "not-a-date",
    frequencyPerWeek: 0,
    actions: { minimum: "", standard: "", stretch: "" },
    reward: "",
  };
  const invalid = Goals.validateGoalRecord(incomplete);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /why/);
  assert.match(invalid.errors.join(" "), /targetDate/);
  assert.match(invalid.errors.join(" "), /behavior/);

  assert.deepEqual(Goals.calculateSMARTCompleteness(complete), {
    score: 1,
    percent: 100,
    completed: 5,
    total: 5,
    criteria: {
      specific: true,
      measurable: true,
      achievable: true,
      relevant: true,
      timeBound: true,
    },
  });
  assert.equal(Goals.calculateSMARTCompleteness(incomplete).percent, 0);
});

test("private config validation falls back atomically when malformed", () => {
  const malformed = Goals.validatePrivateConfig({
    version: 1,
    milestoneLookaheadDays: -1,
    defaultPreparationWindowDays: 4,
    weights: { urgency: "high" },
  });
  assert.equal(malformed.valid, false);
  assert.strictEqual(malformed.config, Goals.DEFAULT_PRIVATE_CONFIG);

  const custom = {
    version: 1,
    milestoneLookaheadDays: 45,
    defaultPreparationWindowDays: 10,
    weights: { urgency: 1, frequency: 2, neglect: 3, milestone: 4, rotation: 5 },
  };
  const valid = Goals.validatePrivateConfig(custom);
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.config, custom);
  assert.notStrictEqual(valid.config, custom);
});

test("personal config validates dates without exposing personal defaults", () => {
  const valid = Goals.validatePersonalConfig({
    schemaVersion: 1,
    arc: { name: "Test arc", start: "2030-01-01", end: "2030-12-31" },
    milestones: [
      {
        id: "private-event",
        label: "Private event",
        date: "2030-06-01",
        preparationWindows: [{ daysBefore: 7, tasks: ["Prepare"] }],
      },
    ],
    attentionDomains: ["example.com"],
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.config.milestones.length, 1);

  const invalid = Goals.validatePersonalConfig({
    schemaVersion: 1,
    arc: { start: "2030-12-31", end: "2030-01-01" },
    milestones: [{ id: "", label: "", date: "not-a-date" }],
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.config.milestones, []);
});

test("date helpers use inclusive calendar boundaries", () => {
  assert.equal(Goals.formatDateKey("2032-02-29"), "2032-02-29");
  assert.equal(Goals.formatDateKey("2031-02-29"), null);
  assert.equal(
    Goals.differenceInCalendarDays("2030-03-11T00:01:00", "2030-03-09T23:59:00"),
    2,
  );
  assert.equal(Goals.formatDateKey(Goals.addDays("2032-02-28", 1)), "2032-02-29");
  assert.equal(Goals.isWithinDateRange("2030-01-01", "2030-01-01", "2030-01-07"), true);
  assert.equal(Goals.isWithinDateRange("2030-01-07", "2030-01-01", "2030-01-07"), true);
  assert.equal(Goals.isWithinDateRange("2030-01-08", "2030-01-01", "2030-01-07"), false);
});

test("date arcs classify and clamp exact boundaries", () => {
  const start = "2030-04-01";
  const end = "2030-04-11";
  assert.deepEqual(Goals.getDateArc(start, end, "2030-03-31"), {
    valid: true,
    phase: "upcoming",
    elapsedDays: 0,
    totalDays: 10,
    progress: 0,
  });
  assert.equal(Goals.getDateArc(start, end, start).phase, "active");
  assert.equal(Goals.getDateArc(start, end, start).progress, 0);
  assert.equal(Goals.getDateArc(start, end, end).progress, 1);
  assert.equal(Goals.getDateArc(start, end, "2030-04-12").phase, "past");
  assert.equal(Goals.getDateArc(end, start, start).valid, false);
});

test("chooses active and upcoming milestones at preparation boundaries", () => {
  const milestones = [
    { id: "active-start", date: "2030-05-15", preparationWindowDays: 10 },
    { id: "active-due", date: "2030-05-05", preparationWindowDays: 10 },
    { id: "upcoming", date: "2030-05-16", preparationWindowDays: 10 },
    { id: "past", date: "2030-05-04", preparationWindowDays: 10 },
    {
      id: "done",
      date: "2030-05-06",
      preparationWindowDays: 10,
      status: "completed",
    },
  ];

  assert.deepEqual(
    Goals.chooseActiveMilestones(milestones, "2030-05-05").map((item) => item.id),
    ["active-due", "active-start"],
  );
  assert.deepEqual(
    Goals.chooseUpcomingMilestones(milestones, "2030-05-05", 11).map((item) => item.id),
    ["upcoming"],
  );
});

test("selects milestone tasks only inside inclusive preparation windows", () => {
  const milestones = [
    {
      id: "launch",
      goalId: "goal-primary",
      date: "2030-08-20",
      tasks: [
        { id: "early", title: "Prepare", startDaysBefore: 14, endDaysBefore: 8 },
        { id: "late", title: "Finalize", startDaysBefore: 7, endDaysBefore: 0 },
      ],
      preparationWindows: [
        {
          startDaysBefore: 21,
          endDaysBefore: 15,
          tasks: [{ id: "window-task", title: "Outline" }],
        },
      ],
    },
  ];

  assert.deepEqual(
    Goals.chooseMilestoneTasks(milestones, "2030-07-30").map((task) => task.id),
    ["window-task"],
  );
  assert.deepEqual(
    Goals.chooseMilestoneTasks(milestones, "2030-08-06").map((task) => task.id),
    ["early"],
  );
  assert.deepEqual(
    Goals.chooseMilestoneTasks(milestones, "2030-08-13").map((task) => task.id),
    ["late"],
  );
  assert.deepEqual(Goals.chooseMilestoneTasks(milestones, "2030-08-21"), []);
});

test("daily mission scheduling is deterministic, capped at three, and rotates areas", () => {
  const goals = [
    goal({ id: "goal-d", area: "Area D" }),
    goal({ id: "goal-b", area: "Area B" }),
    goal({ id: "goal-a", area: "Area A" }),
    goal({ id: "goal-c", area: "Area C" }),
  ];
  const history = [
    {
      goalId: "unrelated",
      area: "Area A",
      date: "2030-06-02",
      planned: true,
      completed: true,
    },
  ];
  const first = Goals.selectDailyMissions(goals, history, [], "2030-06-03", 9);
  const second = Goals.selectDailyMissions(
    [...goals].reverse(),
    structuredClone(history),
    [],
    "2030-06-03",
    9,
  );

  assert.equal(first.length, 3);
  assert.deepEqual(
    first.map((mission) => mission.goalId),
    second.map((mission) => mission.goalId),
  );
  assert.equal(first.some((mission) => mission.goalId === "goal-a"), false);
  assert.equal(new Set(first.map((mission) => mission.id)).size, 3);
});

test("daily mission scheduling reflects frequency neglect and milestone urgency", () => {
  const goals = [
    goal({ id: "steady", area: "Area A", frequencyPerWeek: 1 }),
    goal({ id: "neglected", area: "Area B", frequencyPerWeek: 3 }),
    goal({ id: "milestone-goal", area: "Area C", frequencyPerWeek: 1 }),
  ];
  const history = [
    { goalId: "steady", date: "2030-06-03", completed: true },
    { goalId: "milestone-goal", date: "2030-06-03", completed: true },
  ];
  const milestones = [
    {
      id: "near",
      goalId: "milestone-goal",
      date: "2030-06-05",
      tasks: [{ id: "prepare", daysBefore: 2 }],
    },
  ];
  const selected = Goals.selectDailyMissions(
    goals,
    history,
    milestones,
    "2030-06-03",
    3,
  );

  assert.equal(selected[0].goalId, "neglected");
  assert.ok(
    selected.findIndex((mission) => mission.goalId === "milestone-goal") <
      selected.findIndex((mission) => mission.goalId === "steady"),
  );
  assert.deepEqual(
    selected.find((mission) => mission.goalId === "milestone-goal").milestoneTasks.map(
      (task) => task.id,
    ),
    ["prepare"],
  );
});

test("daily mission urgency includes overdue goals and milestones without tasks", () => {
  const goals = [
    goal({
      id: "later",
      area: "Area A",
      frequencyPerWeek: 1,
      deadline: "2030-12-31",
    }),
    goal({
      id: "overdue",
      area: "Area B",
      frequencyPerWeek: 1,
      deadline: "2030-05-31",
    }),
    goal({
      id: "milestone-only",
      area: "Area C",
      frequencyPerWeek: 1,
      deadline: "2030-12-31",
    }),
  ];
  const history = goals.map((item) => ({
    goalId: item.id,
    date: "2030-06-02",
    completed: true,
  }));
  const selected = Goals.selectDailyMissions(
    goals,
    history,
    [{ id: "near-date", goalId: "milestone-only", date: "2030-06-04" }],
    "2030-06-03",
  );

  assert.equal(selected[0].goalId, "overdue");
  assert.ok(
    selected.findIndex((mission) => mission.goalId === "milestone-only") <
      selected.findIndex((mission) => mission.goalId === "later"),
  );
});

test("weekly consistency counts completed planned opportunities only", () => {
  const opportunities = [
    { date: "2030-07-01", planned: true, completed: true },
    { date: "2030-07-02", planned: true, status: "completed" },
    { date: "2030-07-03", planned: true, completed: false },
    { date: "2030-07-04", planned: false, completed: true },
    { date: "2030-07-08", planned: true, completed: true },
  ];
  assert.deepEqual(
    Goals.calculateWeeklyConsistency(opportunities, "2030-07-01", "2030-07-07"),
    { completed: 2, planned: 3, missed: 1, rate: 2 / 3, percent: 67 },
  );
  assert.deepEqual(Goals.calculateWeeklyConsistency([], "2030-07-01"), {
    completed: 0,
    planned: 0,
    missed: 0,
    rate: 0,
    percent: 0,
  });
});

test("builds a supportive, actionable lapse recovery without changing the goal", () => {
  const source = goal();
  const snapshot = structuredClone(source);
  const recovery = Goals.buildLapseRecovery(source, {
    date: "2030-09-10",
    nextDate: "2030-09-11",
    missedCount: 2,
  });

  assert.deepEqual(source, snapshot);
  assert.equal(recovery.tone, "supportive");
  assert.equal(recovery.goalId, source.id);
  assert.equal(recovery.nextAction, source.actions.minimum);
  assert.equal(recovery.recoveryPlan, source.recoveryPlan);
  assert.equal(recovery.nextDate, "2030-09-11");
  assert.match(recovery.acknowledgement, /does not erase your progress/i);
  assert.doesNotMatch(recovery.message, /failed|lazy|should have/i);
});

test("migrates SMART v1 goals onto identity-owned records with extracted behaviors", () => {
  const migrated = Goals.migrateGoalCollection([goal()], "2030-01-05T12:00:00Z");
  assert.equal(migrated.goals[0].version, 2);
  assert.equal(migrated.goals[0].identityId, "builder");
  assert.equal(migrated.behaviors.length, 1);
  assert.equal(migrated.behaviors[0].standard, "Do the normal step");
  assert.equal(migrated.behaviors[0].goalId, "goal-primary");
});

test("allows goals without a numeric metric and reports readiness instead of SMART scores", () => {
  const qualitative = goal({
    identityId: "explorer",
    area: "social-life",
    metric: { baseline: 0, target: 0, current: 0, unit: "" },
    outcome: "Make SF feel like my city",
  });
  const validation = Goals.validateGoalRecord(qualitative);
  assert.equal(validation.valid, true);
  const readiness = Goals.calculateGoalReadiness(qualitative);
  assert.equal(readiness.ready, true);
  assert.match(readiness.summary, /why, a behavior/i);
});

test("follow-through survives a recovered minimum day and consecutive misses ask if the plan is unrealistic", () => {
  const history = [
    { goalId: "goal-primary", date: "2030-09-08", planned: true, completed: true },
    { goalId: "goal-primary", date: "2030-09-09", planned: true, completed: true, level: "minimum" },
    { goalId: "goal-primary", date: "2030-09-10", planned: true, completed: false },
    { goalId: "goal-primary", date: "2030-09-11", planned: true, completed: false },
    { goalId: "goal-primary", date: "2030-09-12", planned: true, completed: false },
  ];
  assert.equal(Goals.calculateFollowThrough(history.slice(0, 2), "2030-09-09").days, 2);
  assert.equal(Goals.countConsecutiveMisses(history, "goal-primary", "2030-09-12"), 3);
  assert.equal(Goals.deriveFocusTheme({ consecutiveMisses: 3 }), "RECOVERY");
});

test("normalizes title, category, targetDate, obstacles, and supporting behaviors", () => {
  const input = {
    category: "Athlete",
    title: "Run a half marathon",
    why: "Become a stronger athlete.",
    outcome: "Complete a half marathon.",
    targetDate: "2030-06-30",
    obstacles: ["Evenings get overloaded"],
    behaviors: ["Run 3x/week", "Strength train 2x/week", "Recover properly"],
  };
  const normalized = Goals.normalizeGoalRecord(input, "2030-01-05T12:00:00Z");
  assert.equal(normalized.title, "Run a half marathon");
  assert.equal(normalized.category, "Athlete");
  assert.equal(normalized.identityId, "athlete");
  assert.equal(normalized.targetDate, "2030-06-30");
  assert.equal(normalized.deadline, "2030-06-30");
  assert.deepEqual(normalized.obstacles, ["Evenings get overloaded"]);
  assert.deepEqual(
    normalized.behaviors.map((behavior) => behavior.standard),
    ["Run 3x/week", "Strength train 2x/week", "Recover properly"],
  );
  const validation = Goals.validateGoalRecord(input);
  assert.equal(validation.valid, true);
});

test("paused goals leave daily planning and can be resumed", () => {
  const source = goal({ id: "goal-keep", area: "Area A" });
  const paused = Goals.setGoalStatus(source, "paused", "2030-06-03T12:00:00Z");
  assert.equal(paused.status, "paused");
  assert.equal(Goals.isPlannableGoal(paused), false);
  const resumed = Goals.setGoalStatus(paused, "active", "2030-06-04T12:00:00Z");
  assert.equal(resumed.status, "active");
  const selected = Goals.selectDailyMissions([source, paused], [], [], "2030-06-03", 3);
  assert.deepEqual(
    selected.map((mission) => mission.goalId),
    ["goal-keep"],
  );
});

test("today's missions come from supporting behaviors and keep the goal connection", () => {
  const marathon = goal({
    id: "goal-half",
    identityId: "athlete",
    area: "fitness",
    title: "Run a half marathon",
    outcome: "Complete a half marathon.",
    behaviors: [
      { id: "run", standard: "Run 3x/week" },
      { id: "strength", standard: "Strength train 2x/week" },
      { id: "recover", standard: "Recover properly" },
    ],
  });
  const selected = Goals.selectDailyMissions([marathon], [], [], "2030-06-03", 3);
  assert.equal(selected.length, 3);
  assert.deepEqual(
    selected.map((mission) => mission.action),
    ["Run 3x/week", "Strength train 2x/week", "Recover properly"],
  );
  assert.ok(selected.every((mission) => mission.goalId === "goal-half"));
  assert.ok(selected.every((mission) => mission.goalTitle === "Run a half marathon"));
  assert.ok(selected.every((mission) => mission.category === "Athlete"));
});

test("setGoalStatus archives a goal so it leaves daily planning", () => {
  const source = goal({ id: "goal-keep", area: "Area A" });
  const released = Goals.setGoalStatus(source, "cancelled", "2030-06-03T12:00:00Z");
  assert.equal(released.status, "cancelled");
  assert.equal(released.timestamps.updatedAt, "2030-06-03T12:00:00.000Z");
  assert.equal(source.status, "active");

  const selected = Goals.selectDailyMissions(
    [source, released, Goals.setGoalStatus(goal({ id: "goal-done", area: "Area C" }), "completed")],
    [],
    [],
    "2030-06-03",
    3,
  );
  assert.deepEqual(
    selected.map((mission) => mission.goalId),
    ["goal-keep"],
  );
  assert.equal(Goals.setGoalStatus(source, "not-a-status").status, "active");
});

test("chooseLeadingIdentity prefers the identity with the most kept actions", () => {
  assert.equal(Goals.chooseLeadingIdentity([]), null);
  assert.equal(
    Goals.chooseLeadingIdentity([{ identityId: "athlete", planned: 0, completed: 0, percent: 0 }]),
    null,
  );
  const leading = Goals.chooseLeadingIdentity([
    { identityId: "thinker", planned: 1, completed: 1, percent: 100 },
    { identityId: "athlete", planned: 8, completed: 6, percent: 75 },
    { identityId: "builder", planned: 4, completed: 0, percent: 0 },
  ]);
  assert.equal(leading.identityId, "athlete");
});

test("exposes the same dependency-free API to browsers and CommonJS", () => {
  assert.strictEqual(globalThis.LockInGoals, Goals);
  assert.equal(typeof Goals.selectDailyMissions, "function");
  assert.equal(typeof Goals.calculateWeeklyConsistency, "function");
  assert.equal(typeof Goals.setGoalStatus, "function");
});
