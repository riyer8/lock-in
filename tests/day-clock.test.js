const test = require("node:test");
const assert = require("node:assert/strict");

const Clock = require("../src/core/day-clock.js");

test("year countdown counts today through December 31", () => {
  assert.deepEqual(Clock.describeYearCountdown(new Date(2026, 10, 2, 17, 0)), {
    year: 2026,
    nextYear: 2027,
    daysLeft: 60,
    isLastDay: false,
  });
  assert.equal(Clock.describeYearCountdown(new Date(2026, 11, 31, 23, 59)).daysLeft, 1);
  assert.equal(Clock.describeYearCountdown(new Date(2026, 11, 31)).isLastDay, true);
  assert.equal(Clock.describeYearCountdown(new Date(2027, 0, 1)).daysLeft, 365);
});

test("day progress reports percent of today gone and time left", () => {
  const noon = Clock.describeDayProgress(new Date(2026, 10, 2, 12, 0));
  assert.equal(noon.percent, 50);
  assert.equal(noon.remaining, "12h 0m left");
  const late = Clock.describeDayProgress(new Date(2026, 10, 2, 23, 30));
  assert.equal(late.percent, 98);
  assert.equal(late.remaining, "30m left");
  assert.equal(Clock.describeDayProgress(new Date(2026, 10, 2)).percent, 0);
});

test("browser summary keeps the top sites and folds the rest", () => {
  const minutes = (value) => value * 60 * 1000;
  const summary = Clock.summarizeBrowserDomains(
    [
      { domain: "github.com", durationMs: minutes(60) },
      { domain: "docs.google.com", durationMs: minutes(30) },
      { domain: "youtube.com", durationMs: minutes(6) },
      { domain: "x.com", durationMs: minutes(4) },
    ],
    2,
  );
  assert.equal(summary.totalMs, minutes(100));
  assert.deepEqual(
    summary.rows.map((row) => [row.domain, row.share]),
    [
      ["github.com", 0.6],
      ["docs.google.com", 0.3],
      ["2 more", 0.1],
    ],
  );
  assert.equal(summary.rows[2].isRest, true);
  assert.deepEqual(Clock.summarizeBrowserDomains([]), { totalMs: 0, rows: [] });
});
