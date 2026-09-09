const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAdaptiveMissions,
  applyAdaptationToPlan,
  tryNextProposal,
  missionsFromNextAction,
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

test("marks adapted plans so the loop is observable", () => {
  const missions = applyAdaptationToPlan({
    proposed: PROPOSED.slice(0, 3),
    goals: GOALS,
    date: new Date(2026, 8, 9),
    proposal: {
      type: "reschedule",
      changes: "Move deep work to the morning.",
      reason: "Evenings are overloaded.",
    },
    areaLabels: AREA_LABELS,
  });
  assert.ok(missions.every((mission) => mission.source === "adapted-plan"));
  assert.equal(missions[0].adaptedFrom, "reschedule");
  assert.match(missions[0].reason, /morning/i);
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

test("Try this keeps the displayed next action as tomorrow's first mission without AI", () => {
  const next =
    "Read the minimum two pages of How to Scale Your Model tonight at 7:30 PM, on the bus or at home, and stop after two pages if needed.";
  const proposal = tryNextProposal(
    { nextAction: next },
    "Use Try this to adjust the plan.",
  );
  assert.equal(proposal.changes, next);
  assert.equal(proposal.type, "protect-slot");
  const missions = missionsFromNextAction({
    nextAction: proposal.changes,
    fallbackMissions: [
      { title: "Run 3x/week", category: "FITNESS" },
      { title: "Write the paper", category: "CAREER" },
    ],
    date: new Date(2026, 8, 9),
    proposal,
  });
  assert.equal(missions[0].title, next);
  assert.equal(missions[0].source, "adapted-plan");
  assert.equal(missions.length, 3);
  assert.equal(missions[1].title, "Run 3x/week");
});
