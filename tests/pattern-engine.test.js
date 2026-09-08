const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/core/goal-engine.js");
const Patterns = require("../src/audit/pattern-engine.js");

test("emits PLAN_UNREALISTIC after three consecutive misses", () => {
  const patterns = Patterns.detectMultiDayPatterns({
    goals: [{ id: "goal-ml", identityId: "thinker" }],
    history: [
      { goalId: "goal-ml", date: "2030-09-10", planned: true, completed: false },
      { goalId: "goal-ml", date: "2030-09-11", planned: true, completed: false },
      { goalId: "goal-ml", date: "2030-09-12", planned: true, completed: false },
    ],
    asOf: "2030-09-12",
  });
  assert.ok(patterns.some((pattern) => pattern.type === "PLAN_UNREALISTIC"));
});

test("links thinker misses to late browser days", () => {
  const patterns = Patterns.detectMultiDayPatterns({
    goals: [{ id: "goal-ml", identityId: "thinker", area: "mind" }],
    history: [
      { goalId: "goal-ml", date: "2030-09-10", planned: true, completed: false, area: "mind" },
      { goalId: "goal-ml", date: "2030-09-11", planned: true, completed: false, area: "mind" },
    ],
    events: [
      {
        type: "BROWSER_SITE_SESSION",
        timestamp: "2030-09-10T19:30:00",
        metadata: { durationMs: 40 * 60 * 1000, endTime: "2030-09-10T19:40:00" },
      },
      {
        type: "BROWSER_SITE_SESSION",
        timestamp: "2030-09-11T20:10:00",
        metadata: { durationMs: 50 * 60 * 1000, endTime: "2030-09-11T20:15:00" },
      },
    ],
    asOf: "2030-09-11",
  });
  assert.ok(patterns.some((pattern) => pattern.type === "DEEP_WORK_AFTER_LATE_DAYS"));
});
