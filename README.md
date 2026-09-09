# LOCK IN

Local-first Chrome new-tab that turns your goals into a daily plan.

Open a new tab, see what to do today, then look back at what actually
happened. Goals, history, and browser time stay on your machine.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open a new tab.

## Tabs

- **Today** — a few important actions, quieter every-day repeats, and
  timed cues while Chrome is open. Answers “what should I do right now?”
- **Goals** — who you are becoming, and the behaviors that get you there.
- **Arc** — the dated window you are working inside.
- **Audit** — what actually happened: kept and missed actions, a pattern,
  check-ins, and where the browser went.
- **Coach** — an optional local helper that can suggest one next change.

## Private data

Identity-owned goals, behaviors, experiments, mission history, and coach
threads live in `chrome.storage.local` on your device.

Personal dates and labels can live in `src/config/personal.js`. That
file is ignored by git. Copy `src/config/personal.example.js` to
`src/config/personal.js`, then reload the unpacked extension. The
committed example contains no personal information.

## Optional coach

Coach and Audit’s **Try this** can send a bounded recent-context snapshot
to a local Python backend on your machine. The backend can propose a next
action and a plan change. Chat uses the same bound. Your API key stays in
that process and is never loaded by the extension.

Requires Python 3.9 or newer. Chrome cannot start Python itself, so the
coach uses a one-time native helper to launch the local backend.

1. Copy `.env.example` to `.env`.
2. Add your key to `OPENAI_DEVELOPER_KEY` in `.env`.
3. Optionally change `OPENAI_MODEL`.
4. Load the unpacked extension in Chrome.
5. Run `npm run setup-coach` once (`python3 server/setup_coach.py` also works).
6. Reload LOCK IN on `chrome://extensions`.
7. Open a new tab and select **Coach**.

If you move this folder, run `npm run setup-coach` again.

The backend listens on `http://127.0.0.1:8787`. The extension may call
that local origin; regular web-page origins are rejected. `.env` is
excluded from git.

Coach adaptations write tomorrow’s plan. Difficulty scales down when
recent completion is low. After three missed days of the same behavior,
Audit asks whether the plan was unrealistic instead of declaring a
streak dead.

## Working on this

Product intent: [docs/PRODUCT.md](docs/PRODUCT.md). How to work in the
repo: [AGENTS.md](AGENTS.md). Tests live in `tests/`.
