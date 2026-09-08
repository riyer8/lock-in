const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/core/goal-engine.js");
const Experiments = require("../src/core/experiment-engine.js");

test("normalizes and evaluates an experiment protocol", () => {
  const experiment = Experiments.normalizeExperiment({
    id: "experiment-04",
    hypothesis: "Morning workouts will improve my evening energy.",
    startDate: "2030-09-01",
    endDate: "2030-09-07",
    status: "active",
    protocol: [
      { title: "Workout before work", measureKey: "completion" },
      { title: "Record energy at 6 PM", measureKey: "energy", when: "18:00" },
    ],
  });
  assert.equal(Experiments.validateExperiment(experiment).valid, true);
  assert.equal(Experiments.isActiveOn(experiment, "2030-09-04"), true);
  assert.equal(Experiments.protocolActionsForDate([experiment], "2030-09-04").length, 2);

  const evaluated = Experiments.evaluateExperiment(
    experiment,
    [
      { date: "2030-09-01", experimentId: "experiment-04", planned: true, completed: true },
      { date: "2030-09-02", experimentId: "experiment-04", planned: true, completed: true },
      { date: "2030-09-03", experimentId: "experiment-04", planned: true, completed: false },
    ],
    [
      { key: "energy", value: 4 },
      { key: "energy", value: 5 },
    ],
  );
  assert.equal(evaluated.status, "completed");
  assert.equal(evaluated.result.completedDays, 2);
  assert.equal(evaluated.result.measures.energy.count, 2);
});
