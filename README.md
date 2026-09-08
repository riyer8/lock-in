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

## Daily Audit

After onboarding, open **Today's Audit** from the command center to review
mission completion, mood, observed browser time, and deterministic patterns.
Use **Refresh Audit** to regenerate the persisted audit from the event stream.
