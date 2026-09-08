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
