# LOCK IN

A local-first Chrome new-tab behavior-change system for a Winter Arc.

**Agents and anyone changing the product:** read [docs/PRODUCT.md](docs/PRODUCT.md) first. That is the canonical purpose, philosophy, and architecture. [AGENTS.md](AGENTS.md) is how to work in this repo.

Identity → goals → behaviors → daily plan → real-world data → audit →
patterns → experiments → AI coach → adapt, then repeat.

The product is that loop, not a habit tracker with AI attached. It
optimizes for adherence, recovery, and learning — not breakable streaks.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open a new tab.

## Tabs

- **Today** — three focus actions and a Start button. Answers “what should I do right now?”
- **Goals** — who you are becoming. Each identity has a why, outcome, behaviors, progress, and obstacles.
- **Arc** — the dated window (Winter Arc by default) and per-identity adherence.
- **Audit** — a reflection on what happened, what was missed, a multi-day pattern, and a coach take.
- **Coach** — a cached insight, one-tap adapt (`Yes, fix it`), then chat.
- **Progress** — evidence that helps you decide, not a vanity dashboard.

Manual sleep, energy, and fitness check-ins live on Audit. Browser
observation remains a local event stream. Fitness imports can later write
the same event types with a different `source`.

## AI Coach

The Coach tab (and Audit’s **Try this**) send a bounded seven-day context
to a local Python backend. That context includes the Personal Blueprint,
active goals, current missions, today’s audit, six prior daily audits,
important recent events, intervention outcomes, patterns, experiments,
the last insight, and the current chat thread. It does not send the
entire event history.

The backend asks OpenAI for a structured observation, pattern, priority,
next action, encouragement, and a proposed adaptation. Chat uses the same
bound. The OpenAI key stays in the backend process and is never loaded by
the extension.

Requires Python 3.9 or newer. Chrome cannot start Python itself, so the
Coach uses a one-time native helper to launch the local backend.

1. Copy `.env.example` to `.env`.
2. Add your key to `OPENAI_DEVELOPER_KEY` in `.env`.
3. Optionally change `OPENAI_MODEL`.
4. Load the unpacked extension in Chrome.
5. Run `npm run setup-coach` once (`python3 server/setup_coach.py` also works).
6. Reload LOCK IN on `chrome://extensions`.
7. Open a new tab and select **Coach**.

If you move this folder, run `npm run setup-coach` again.

The backend listens on `http://127.0.0.1:8787` and exposes
`GET /health`, `POST /api/coach`, `POST /api/plan`, `POST /api/adapt`,
and `POST /api/coach/chat`. The extension is permitted to call that local
origin; regular web-page origins are rejected. `.env` is excluded from
both git and Cursor agent access.

## Adaptive plan

Coach adaptations write tomorrow’s plan. Difficulty still scales down
when recent completion is low. After three missed days of the same
behavior, Audit asks whether the plan was unrealistic instead of
declaring a streak dead.

## Private goals and milestones

LOCK IN keeps identity-owned goals, behaviors, experiments, mission
history, and coach threads in `chrome.storage.local` on your device.

Personal dates and labels can live in `src/config/personal.js`. That file
is ignored by git. Copy `src/config/personal.example.js` to
`src/config/personal.js`, add your `displayName`, arc, and milestones,
then reload the unpacked extension. The committed example contains no
personal information.

Each goal hangs off an identity and produces behaviors (cue, minimum,
standard, if-then recovery). Today’s three actions are scheduled
instances of those behaviors, plus any active experiment protocol.
Progress uses planned-opportunity consistency, including recovered
minimum days.
