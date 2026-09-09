const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.html"),
  "utf8",
);

test("coach screen exposes chat history, input, send, loading, and error states", () => {
  for (const id of [
    "coach-screen",
    "coach-thread",
    "coach-chat-form",
    "coach-chat-input",
    "coach-chat-send",
    "coach-chat-loading",
    "coach-chat-error",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-nav="coach-screen"/);
});

test("audit Try next exposes Try this and a status line", () => {
  for (const id of [
    "audit-coach-title",
    "audit-coach-copy",
    "try-this",
    "audit-adapt-status",
    "yes-fix-it",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, />Try next</);
  assert.match(html, />Try this</);
});

test("Audit is the evidence surface, including past browser time", () => {
  assert.match(html, /data-nav="daily-audit-screen"/);
  assert.doesNotMatch(html, /data-nav="progress-screen"/);
  assert.doesNotMatch(html, /id="progress-screen"/);
  for (const id of [
    "audit-browser-card",
    "audit-browser-title",
    "audit-browser-total",
    "audit-browser-list",
    "audit-browser-days",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});
