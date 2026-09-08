const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RECENT_WINDOW_DAYS,
  buildCoachContext,
} = require("../src/coach/context-builder.js");

test("builds a bounded coach context and drops noisy events", () => {
  const context = buildCoachContext({
    blueprint: { identities: ["builder"] },
    goals: [{ outcome: "Build something useful" }],
    todayAudit: { date: "2026-09-08" },
    recentAudits: Array.from({ length: 10 }, (_, index) => ({
      date: `2026-09-0${7 - index}`,
    })),
    recentEvents: [
      {
        type: "COMMAND_CENTER_OPENED",
        timestamp: "2026-09-08T08:00:00.000Z",
      },
      {
        type: "MISSION_COMPLETED",
        timestamp: "2026-09-08T09:00:00.000Z",
        metadata: { missionId: "build" },
      },
    ],
    currentMissions: Array.from({ length: 5 }, (_, index) => ({
      id: `mission-${index}`,
    })),
  });

  assert.equal(context.recentAudits.length, RECENT_WINDOW_DAYS - 1);
  assert.equal(context.currentMissions.length, 3);
  assert.deepEqual(
    context.recentEvents.map(({ type }) => type),
    ["MISSION_COMPLETED"],
  );
});

test("separates future intervention outcomes without inventing current ones", () => {
  const withoutInterventions = buildCoachContext({
    blueprint: { identities: ["builder"] },
  });
  const withInterventions = buildCoachContext({
    blueprint: { identities: ["builder"] },
    recentEvents: [
      {
        type: "INTERVENTION_DISMISSED",
        timestamp: "2026-09-08T10:00:00.000Z",
        metadata: { interventionOutcome: "dismissed" },
      },
    ],
  });

  assert.deepEqual(withoutInterventions.interventionOutcomes, []);
  assert.equal(withInterventions.interventionOutcomes.length, 1);
  assert.equal(
    withInterventions.interventionOutcomes[0].type,
    "INTERVENTION_DISMISSED",
  );
});
