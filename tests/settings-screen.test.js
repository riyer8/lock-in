const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.html"),
  "utf8",
);
const appJs = fs.readFileSync(
  path.join(__dirname, "../src/newtab/newtab.js"),
  "utf8",
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"),
);

test("Coach tab and screen are gone", () => {
  assert.doesNotMatch(html, /data-nav="coach-screen"/);
  assert.doesNotMatch(html, /id="coach-screen"/);
  assert.doesNotMatch(html, /id="coach-thread"/);
  assert.doesNotMatch(html, /id="coach-chat-form"/);
  assert.ok(!manifest.permissions?.includes("nativeMessaging"));
  assert.ok(!manifest.host_permissions);
});

test("settings gear opens an in-app Winter Arc reset with a second confirm", () => {
  for (const id of [
    "open-settings",
    "settings-overlay",
    "settings-home",
    "settings-reset",
    "settings-confirm",
    "settings-confirm-reset",
    "settings-confirm-cancel",
    "settings-close",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, />Reset Winter Arc</);
  assert.match(html, />Yes, reset</);
  assert.match(html, />No, keep this arc</);
  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /data-theme-choice="system"/);
  assert.match(html, /data-theme-choice="light"/);
  assert.match(html, /data-theme-choice="dark"/);
  assert.match(appJs, /function applyTheme/);
  assert.match(appJs, /function previewResetArc/);
  assert.match(appJs, /async function confirmResetArc/);
  const settingsJs = appJs.slice(
    appJs.indexOf("function settingsOverlay"),
    appJs.indexOf("enterArcButton.addEventListener"),
  );
  assert.match(settingsJs, /confirmResetArc/);
  assert.doesNotMatch(settingsJs, /window\.confirm/);
});

test("audit Try next exposes Try this and a status line", () => {
  for (const id of [
    "audit-coach-title",
    "audit-coach-copy",
    "try-this",
    "audit-adapt-status",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, />Try next</);
  assert.match(html, />Try this</);
  assert.doesNotMatch(html, /id="yes-fix-it"/);
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
