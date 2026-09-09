const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.html"),
  "utf8",
);
const js = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.js"),
  "utf8",
);

test("Today extras let you add repeating dailies, one-offs, and timed cues", () => {
  for (const id of [
    "today-daily-form",
    "today-daily-input",
    "today-daily-list",
    "today-task-form",
    "today-task-input",
    "today-task-list",
    "today-cue-rail",
    "today-cue-card",
    "today-cue-title",
    "today-cue-dismiss",
    "today-cue-settings",
    "today-cue-form",
    "today-cue-input",
    "today-cue-interval",
    "today-cue-list",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Every day/);
  assert.match(html, /Also today/);
  assert.match(html, /today-cue-dismiss/);
  assert.match(html, /every/);
});

test("Today greeting includes a time-of-day emoji", () => {
  assert.match(js, /emoji: "☀️"/);
  assert.match(js, /emoji: "🌇"/);
  assert.match(js, /emoji: "🌙"/);
  assert.match(html, /today-greeting-emoji/);
});

test("cue rows stay on one line and the popup flies in", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/newtab/app-screens.css"),
    "utf8",
  );
  assert.match(css, /\.today-cue-list li \{[\s\S]*?display: flex/);
  assert.match(css, /flex-direction: row !important/);
  assert.match(css, /\.today-cue-toggle\[aria-pressed="true"\]/);
  assert.match(css, /#b8d8c3/);
  assert.match(css, /cue-fly-in/);
  assert.match(js, /is-entering/);
});
