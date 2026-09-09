const test = require("node:test");
const assert = require("node:assert/strict");

const Cues = require("../src/core/cue-engine.js");

test("defaults to water and walk cues when nothing is stored", () => {
  const cues = Cues.normalizeCueCollection(null);
  assert.deepEqual(
    cues.map((cue) => cue.title),
    ["Drink water", "Stand and walk"],
  );
  assert.ok(cues.every((cue) => cue.intervalMinutes === 60 && cue.enabled));
});

test("keeps an empty list when the user cleared cues", () => {
  assert.deepEqual(Cues.normalizeCueCollection([]), []);
});

test("a cue waits for its interval after first load, then after it is shown", () => {
  const cue = Cues.normalizeCue({ id: "water", title: "Drink water", intervalMinutes: 60 });
  const fresh = Cues.ensureInitialized({}, "2026-09-09T10:00:00");
  assert.equal(Cues.isDue(cue, fresh, "2026-09-09T10:30:00"), false);
  assert.equal(Cues.isDue(cue, fresh, "2026-09-09T11:00:00"), true);
  const shown = Cues.markShown(fresh, "water", "2026-09-09T11:00:00");
  assert.equal(Cues.isDue(cue, shown, "2026-09-09T11:30:00"), false);
  assert.equal(Cues.isDue(cue, shown, "2026-09-09T12:00:00"), true);
});

test("quiet hours stay silent even when a cue is due", () => {
  const cue = Cues.normalizeCue({ id: "water", title: "Drink water", intervalMinutes: 60 });
  const shown = Cues.markShown({}, "water", "2026-09-09T10:00:00");
  assert.equal(Cues.isQuietHour("2026-09-09T23:30:00"), true);
  assert.equal(Cues.chooseDueCue([cue], shown, "2026-09-09T23:30:00"), null);
  assert.equal(Cues.chooseDueCue([cue], shown, "2026-09-09T11:05:00")?.id, "water");
});

test("a cue can repeat every 20 minutes", () => {
  const cue = Cues.normalizeCue({
    id: "water",
    title: "Drink water",
    intervalMinutes: 20,
  });
  assert.equal(cue.intervalMinutes, 20);
  const shown = Cues.markShown({}, "water", "2026-09-09T10:00:00");
  assert.equal(Cues.isDue(cue, shown, "2026-09-09T10:15:00"), false);
  assert.equal(Cues.isDue(cue, shown, "2026-09-09T10:20:00"), true);
});

test("done and later both wait for the next hour", () => {
  const cue = Cues.normalizeCue({ id: "walk", title: "Stand and walk" });
  const done = Cues.markDone({ pendingId: "walk" }, "walk", "2026-09-09T14:00:00");
  assert.equal(done.pendingId, "");
  assert.equal(Cues.isDue(cue, done, "2026-09-09T14:30:00"), false);
  assert.equal(Cues.isDue(cue, done, "2026-09-09T15:00:00"), true);
  const later = Cues.markSnoozed({ pendingId: "walk" }, "walk", "2026-09-09T14:00:00");
  assert.equal(later.pendingId, "");
  assert.equal(Cues.isDue(cue, later, "2026-09-09T14:59:00"), false);
});
