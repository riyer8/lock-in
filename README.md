# LOCK IN

A focused Chrome new-tab extension.

## Install locally

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project folder.
5. Open a new tab.

## AI Coach

The AI Coach sends a bounded seven-day context to a local Python backend only
when you select **Ask Coach**. That context includes the Personal Blueprint,
active goals, current missions, today's audit, six prior daily audits, important
recent events, and any available intervention outcomes. It does not send the
entire event history.

The backend asks OpenAI for a structured observation, pattern, single priority,
concrete next action, and evidence-based encouragement. The OpenAI key stays in
the backend process and is never loaded by the extension.

Requires Python 3.9 or newer. Chrome cannot start Python itself, so Ask Coach
uses a one-time native helper to launch the local backend. The new-tab page,
goals, audits, and observer stay in JavaScript because Chrome extensions cannot
run Python.

1. Copy `.env.example` to `.env`.
2. Add your key to `OPENAI_DEVELOPER_KEY` in `.env`.
3. Optionally change `OPENAI_MODEL`.
4. Load the unpacked extension in Chrome.
5. Run `npm run setup-coach` once (`python3 server/setup_coach.py` also works).
   After that, **Ask Coach** starts the backend for you — no terminal on later
   uses, including after reboot.
6. Reload LOCK IN on `chrome://extensions`.
7. Open a new tab and select **Ask Coach**.

If you move this folder, run `npm run setup-coach` again.

The backend listens on `http://127.0.0.1:8787` and exposes
`GET /health`, `POST /api/coach`, and `POST /api/plan`. The extension is
permitted to call that local origin; regular web-page origins are rejected.
`.env` is excluded from both git and Cursor agent access.

## Adaptive daily plan

**Generate Today's Plan** uses the same bounded seven-day context as Ask Coach.
The backend returns 3–5 structured missions. LOCK IN maps those onto the same
Command Center mission objects, keeps date-bound and already-completed
commitments, and scales the plan down when recent completion is low.

Use **Regenerate Plan** to replace today's plan without dropping finished work.

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
normal action, stretch action, and an if-then recovery plan. Daily missions
default from at most three active goals and nearby milestones. Generate Today's
Plan can replace that with 3–5 adaptive missions for the day. Progress uses
planned-opportunity consistency instead of a breakable streak.
