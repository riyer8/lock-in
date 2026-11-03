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

test("no top navigation or settings, and the page is dark only", () => {
  assert.doesNotMatch(html, /id="app-nav"/);
  assert.doesNotMatch(html, /id="open-settings"/);
  assert.doesNotMatch(html, /id="settings-overlay"/);
  assert.doesNotMatch(html, /data-theme-choice/);
  assert.doesNotMatch(html, /prefers-color-scheme/);
  assert.match(html, /dataset\.theme = "dark"/);
  assert.doesNotMatch(appJs, /function applyTheme/);
  assert.doesNotMatch(appJs, /prefers-color-scheme: light/);
  for (const file of ["styles.css", "app-screens.css", "lock-in.css"]) {
    const css = fs.readFileSync(path.join(__dirname, "../src/newtab", file), "utf8");
    assert.doesNotMatch(css, /data-theme="(light|system)"/, file);
  }
});

test("Audit tab is gone and past browser days live on Today", () => {
  assert.doesNotMatch(html, /data-nav="daily-audit-screen"/);
  assert.doesNotMatch(html, /id="daily-audit-screen"/);
  assert.doesNotMatch(html, /data-nav="progress-screen"/);
  assert.doesNotMatch(html, /id="progress-screen"/);
  assert.doesNotMatch(html, /id="try-this"/);
  assert.match(html, /id="lockin-browser-week"/);
  assert.match(html, /id="lockin-browser-today"/);
  assert.match(appJs, /selectedBrowserDateKey/);
  assert.match(appJs, /dataset\.browserDay/);
});

test("first paint restores the last screen instead of flashing landing", () => {
  assert.match(html, /function bootLockIn/);
  assert.match(html, /html:not\(\.is-ready\) body/);
  assert.match(html, /html\.is-ready body/);
  assert.match(html, /transition: opacity 560ms/);
  assert.match(html, /id="landing-screen" hidden/);
  assert.match(html, /lock-in-onboarding-complete/);
  assert.match(html, /dataset\.screen/);
  assert.match(html, /dataset\.boot = APP\[screenId\] \? "app" : "onboarding"/);
  assert.match(html, /today: "command-center-screen"/);
  assert.doesNotMatch(html, /setTimeout\(function \(\) \{\s*document\.documentElement\.classList\.add\("is-ready"\)/);
  assert.match(appJs, /function revealApp/);
  assert.match(appJs, /document\.documentElement\.dataset\.screen = screenId/);
});
