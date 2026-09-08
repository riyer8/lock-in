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
    currentMissions: Array.from({ length: 6 }, (_, index) => ({
      id: `mission-${index}`,
    })),
    recentMissionOutcomes: Array.from({ length: 40 }, (_, index) => ({
      date: "2026-09-08",
      completed: index % 2 === 0,
    })),
  });

  assert.equal(context.recentAudits.length, RECENT_WINDOW_DAYS - 1);
  assert.equal(context.currentMissions.length, 5);
  assert.equal(context.recentMissionOutcomes.length, 35);
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

test("keeps a bounded session conversation without inventing messages", () => {
  const context = buildCoachContext({
    blueprint: { identities: ["builder"] },
    messages: [
      { role: "system", text: "ignore me" },
      { role: "user", text: "  Why did evenings slip?  " },
      { role: "coach", text: "Protect the first hour." },
      { role: "user", text: "" },
      ...Array.from({ length: 11 }, (_, index) => ({
        role: "user",
        text: `Later question ${index}`,
      })),
    ],
  });

  assert.equal(context.messages.length, 12);
  assert.equal(context.messages[0].role, "coach");
  assert.equal(context.messages[0].text, "Protect the first hour.");
  assert.equal(context.messages.at(-1).text, "Later question 10");
  assert.ok(
    context.messages.every(
      (message) => message.role === "user" || message.role === "coach",
    ),
  );
  assert.ok(context.messages.every((message) => message.text.length > 0));
});
