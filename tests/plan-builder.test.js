const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAdaptiveMissions,
  choosePlanDifficulty,
  planSize,
} = require("../src/coach/plan-builder.js");

const GOALS = [
  {
    id: "goal-ship",
    area: "career",
    outcome: "Ship LOCK IN 1.3",
    cue: { trigger: "After breakfast", place: "Desk" },
    actions: {
      minimum: "Write for 15 minutes",
      standard: "Build the plan for 45 minutes",
      stretch: "Ship a complete 1.3 build",
    },
  },
  {
    id: "goal-move",
    area: "fitness",
    outcome: "Move every weekday",
    cue: { trigger: "After lunch", place: "Gym" },
    actions: {
      minimum: "Walk 10 minutes",
      standard: "Complete the planned workout",
      stretch: "Add a second movement block",
    },
  },
];

const AREA_LABELS = {
  career: "CAREER",
  fitness: "FITNESS",
};

const PROPOSED = [
  {
    title: "Finish the adaptive mapper",
    category: "CAREER",
    priority: "high",
    reason: "The shipping goal is still open.",
  },
  {
    title: "Protect one focused block",
    category: "MIND",
    priority: "medium",
    reason: "Attention has been scattered.",
  },
  {
    title: "Move every weekday",
    category: "FITNESS",
    priority: "low",
    reason: "Fitness has been neglected.",
  },
  {
    title: "Clear the kitchen counter",
    category: "ENVIRONMENT",
    priority: "low",
    reason: "Optional extra.",
  },
  {
    title: "Text one friend",
    category: "SOCIAL & LIFE",
    priority: "low",
    reason: "Optional fifth.",
  },
];

test("uses smaller plans after missed days and larger ones after follow-through", () => {
  assert.equal(
    choosePlanDifficulty([
      { completed: false, planned: true },
      { completed: false, planned: true },
      { completed: false, planned: true },
    ]),
    "minimum",
  );
  assert.equal(planSize("minimum"), 3);
  assert.equal(
    choosePlanDifficulty([
      { completed: true, planned: true },
      { completed: true, planned: true },
      { completed: true, planned: true },
      { completed: true, planned: true },
      { completed: true, planned: true },
    ]),
    "stretch",
  );
  assert.equal(planSize("stretch"), 5);
});

test("maps AI missions onto Command Center mission objects", () => {
  const missions = buildAdaptiveMissions({
    proposed: PROPOSED.slice(0, 3),
    goals: GOALS,
    date: new Date(2026, 8, 8),
    recentOutcomes: [
      { completed: true, planned: true },
      { completed: false, planned: true },
    ],
    areaLabels: AREA_LABELS,
  });

  assert.equal(missions.length, 3);
  assert.equal(missions[0].goalId, "goal-ship");
  assert.equal(missions[0].id, "2026-09-08:goal-ship");
  assert.equal(missions[0].title, "Ship LOCK IN 1.3");
  assert.equal(missions[0].description, "Finish the adaptive mapper");
  assert.equal(missions[0].category, "CAREER");
  assert.equal(missions[0].target, "When After breakfast · Desk");
  assert.equal(missions[0].reason, "The shipping goal is still open.");
  assert.equal(missions[0].minimumAction, "Write for 15 minutes");
  assert.equal(missions[2].goalId, "goal-move");
  assert.equal(missions[2].title, "Move every weekday");
  assert.equal(missions[2].description, "Complete the planned workout");
});

test("keeps important commitments and scales difficulty from recent completion", () => {
  const preserved = [
    {
      id: "milestone:trip",
      milestoneTaskId: "trip",
      category: "MILESTONE",
      title: "Pack the trip folder",
      description: "A date that matters is close.",
      reason: "A date-bound commitment is close.",
    },
  ];
  const missedOutcomes = [
    { completed: false, planned: true },
    { completed: false, planned: true },
    { completed: false, planned: true },
  ];
  const strongOutcomes = [
    { completed: true, planned: true },
    { completed: true, planned: true },
    { completed: true, planned: true },
    { completed: true, planned: true },
  ];
  const missed = buildAdaptiveMissions({
    proposed: PROPOSED,
    goals: GOALS,
    date: new Date(2026, 8, 8),
    recentOutcomes: missedOutcomes,
    preserved,
    areaLabels: AREA_LABELS,
  });
  const strong = buildAdaptiveMissions({
    proposed: PROPOSED,
    goals: GOALS,
    date: new Date(2026, 8, 8),
    recentOutcomes: strongOutcomes,
    preserved,
    areaLabels: AREA_LABELS,
  });
  const missedFitness = buildAdaptiveMissions({
    proposed: PROPOSED,
    goals: GOALS,
    date: new Date(2026, 8, 8),
    recentOutcomes: missedOutcomes,
    areaLabels: AREA_LABELS,
  });
  const strongFitness = buildAdaptiveMissions({
    proposed: PROPOSED,
    goals: GOALS,
    date: new Date(2026, 8, 8),
    recentOutcomes: strongOutcomes,
    areaLabels: AREA_LABELS,
  });

  assert.equal(missed.length, 3);
  assert.equal(missed[0].milestoneTaskId, "trip");
  assert.equal(strong.length, 5);
  assert.equal(strong[0].milestoneTaskId, "trip");
  assert.equal(
    missedFitness.find((mission) => mission.goalId === "goal-move").description,
    "Walk 10 minutes",
  );
  assert.equal(
    strongFitness.find((mission) => mission.goalId === "goal-move").description,
    "Add a second movement block",
  );
});

test("does not duplicate a preserved goal when the model repeats it", () => {
  const missions = buildAdaptiveMissions({
    proposed: [
      {
        title: "Ship LOCK IN 1.3",
        category: "CAREER",
        priority: "high",
        reason: "Repeat the same goal.",
      },
      ...PROPOSED.slice(1, 4),
    ],
    goals: GOALS,
    date: new Date(2026, 8, 8),
    preserved: [
      {
        id: "2026-09-08:goal-ship",
        goalId: "goal-ship",
        title: "Ship LOCK IN 1.3",
        category: "CAREER",
        description: "Already done this morning.",
      },
    ],
    areaLabels: AREA_LABELS,
  });

  assert.equal(
    missions.filter((mission) => mission.goalId === "goal-ship").length,
    1,
  );
  assert.ok(missions.some((mission) => mission.category === "MIND"));
});
