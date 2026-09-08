# LOCK IN

A focused Chrome new-tab extension.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open a new tab.

## Development

Run tests:

```sh
node --test tests/*.test.js
```

Open the event stream with `Command+Shift+E` or `Ctrl+Shift+E`.

## Daily reflection

After onboarding, open **Today's reflection** from the command center to review
mission completion, mood, tracked browser time, and deterministic patterns.
Use **Refresh reflection** to regenerate it from the event stream.

## Private goals and milestones

LOCK IN keeps SMART goals, progress, mission history, and weekly reviews in
`chrome.storage.local` on your device.

Personal dates and labels can live in `src/config/personal.js`. That file is
ignored by git. Copy `src/config/personal.example.js` to
`src/config/personal.js`, add your milestones and preparation windows, then
reload the unpacked extension. The committed example contains no personal
information.

Each goal includes a measurable outcome, deadline, action cue, minimum action,
normal action, stretch action, and an if-then recovery plan. Daily missions are
selected from at most three active goals and nearby milestones. Progress uses
planned-opportunity consistency instead of a breakable streak.
