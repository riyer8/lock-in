const test = require("node:test");
const assert = require("node:assert/strict");

const Dailies = require("../src/core/daily-engine.js");

test("repeating dailies keep title and come back without today's check", () => {
  const listed = Dailies.normalizeDailyCollection([
    { id: "bed", title: "Make the bed" },
    { id: "bed", title: "Duplicate" },
    { title: "  " },
    { id: "water", title: "Lemon water" },
  ]);
  assert.deepEqual(
    listed.map((daily) => daily.id),
    ["bed", "water"],
  );
  const today = Dailies.withTodayState(listed, ["bed"]);
  assert.equal(today[0].completedToday, true);
  assert.equal(today[1].completedToday, false);
});

test("caps repeating dailies so they stay quieter than focus", () => {
  const listed = Dailies.normalizeDailyCollection(
    Array.from({ length: 12 }, (_, index) => ({
      id: `daily-${index}`,
      title: `Daily ${index}`,
    })),
  );
  assert.equal(listed.length, Dailies.MAX_DAILIES);
});
