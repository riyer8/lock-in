const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const Goals = require("../src/core/goal-engine.js");

const html = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.html"),
  "utf8",
);

test("goals screen exposes first-class behavior create, archive, and evidence surfaces", () => {
  for (const id of [
    "goal-behavior-list",
    "add-goal-behavior",
    "goal-archived-behaviors",
    "goal-archived-behavior-list",
    "goal-today-list",
    "goal-progress-copy",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Repeatable actions that move this outcome/);
});

test("a goal can define the repeatable behaviors that make it happen", () => {
  const goal = Goals.normalizeGoalRecord(
    {
      identityId: "athlete",
      title: "Run a half marathon",
      why: "Become a stronger athlete.",
      outcome: "Complete a half marathon.",
      targetDate: "2030-06-30",
      behaviors: [
        {
          id: "run",
          title: "Run 3x/week",
          description: "Easy aerobic miles.",
          frequency: 3,
          difficulty: "medium",
        },
        {
          id: "strength",
          title: "Strength train 2x/week",
          frequency: 2,
          difficulty: "hard",
        },
      ],
    },
    "2030-01-05T12:00:00Z",
  );
  assert.equal(goal.behaviors.length, 2);
  assert.deepEqual(
    goal.behaviors.map((behavior) => ({
      id: behavior.id,
      goalId: behavior.goalId,
      title: behavior.title,
      frequency: behavior.frequency,
      difficulty: behavior.difficulty,
      status: behavior.status,
    })),
    [
      {
        id: "run",
        goalId: goal.id,
        title: "Run 3x/week",
        frequency: 3,
        difficulty: "medium",
        status: "active",
      },
      {
        id: "strength",
        goalId: goal.id,
        title: "Strength train 2x/week",
        frequency: 2,
        difficulty: "hard",
        status: "active",
      },
    ],
  );
  const missions = Goals.selectDailyMissions([goal], [], [], "2030-06-03", 3);
  assert.equal(missions.length, 2);
  assert.ok(missions.every((mission) => mission.goalId === goal.id));
  assert.deepEqual(
    missions.map((mission) => mission.behaviorId).sort(),
    ["run", "strength"],
  );
});
