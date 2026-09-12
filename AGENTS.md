# Agent instructions for LOCK IN

LOCK IN is a personal behavior-change operating system, not a habit tracker, todo list, calendar, or dashboard.

**Before changing or building anything, read [docs/PRODUCT.md](docs/PRODUCT.md).** That file is the canonical product context: purpose, philosophy, architecture loop, product areas, and design/technical north star. This file tells you how to work in the repo. If implementation and the product doc disagree, move the product toward the doc.

## Decision gate

When deciding whether to build something, ask:

> Does this help me make better decisions about my life and actually follow through?

If not, don't build it.

## What the product is trying to become

The loop is the product:

**Choose → Plan → Act → Observe → Audit → Learn → Adapt**

Conceptual architecture:

```text
IDENTITY → GOALS → BEHAVIORS → DAILY PLAN → REAL LIFE
  → OBSERVATION → AUDIT → PATTERNS → EXPERIMENTS → ADAPT ↺
```

Principles that constrain every change:

1. **Behavior > intentions.** Planned vs actual. EventStore is the behavioral source of truth.
2. **Consistency > perfection.** Recovery, not punishment. Never miss twice.
3. **Adaptation > rigid plans.** If a plan repeatedly fails, change the plan.
4. **Fewer important actions.** About 3–5 per day. One obvious next action on Today.
5. **Evidence > assumptions.** Label fact, observation, hypothesis, and action separately. Never present guesses as facts.
6. **Learn the user.** Personalize from real behavior over time.

Screens answer one question each:

| Area | Question |
| --- | --- |
| Today | What should I do right now? |
| Goals | Who am I becoming and what am I trying to accomplish? |
| Arc | Am I actually changing? |
| Audit | What actually happened, and what should I try next? |
| Experiments | What should I try to learn about myself? |

Today is the primary screen. Do not turn it into a metric dashboard. Goals are meaningful outcomes, not tiny habits. Arc should feel motivating and beautiful, not like a spreadsheet. Adaptation is local on Audit (**Try this**). Do not add a Coach tab or AI backend.

Design: premium, calm, cinematic, intelligent, futuristic, personal, slightly feminine but not stereotypically so. Avoid generic SaaS dashboards, rainbow gradients, childish gamification, motivational quotes, and chart spam.

Build incrementally: small feature → test → use → learn → improve. Stay local-first. Do not add infrastructure unless the feature requires it.

## How the current repo maps

LOCK IN is a local-first Chrome new-tab extension (`manifest.json` overrides new tab with `src/newtab/newtab.html`).

| Product area | Current surface |
| --- | --- |
| Today | `command-center-screen` |
| Goals | `goals-screen` |
| Arc | `arc-screen` |
| Audit | `daily-audit-screen` (what happened, check-ins, observed browser time, Try this) |
| Settings | nav gear → in-app overlay to reset the Winter Arc |
| Experiments | engine + Audit experiment result; not a top-level tab yet |

| Concern | Where it lives |
| --- | --- |
| UI | `src/newtab/` |
| Identity, goals, daily missions | `src/core/goal-engine.js` |
| Behavioral events | `src/core/event-engine.js` (`EventStore`) |
| Experiments | `src/core/experiment-engine.js` |
| Audit + patterns | `src/audit/` |
| Browser observation | `src/observer/browser-observer.js` |
| Local plan adapt | `src/coach/plan-builder.js` |
| Background / event intake | `src/background/background.js` |
| Private arc dates and name | `src/config/personal.js` (gitignored; copy from `personal.example.js`) |

Keep data, logic, and UI separated. Prefer writing new behavior as events in EventStore over inventing a parallel source of truth.

## Working in this repo

- Product intent: [docs/PRODUCT.md](docs/PRODUCT.md)
- Install: [README.md](README.md)
- Tests live in `tests/`. Prefer a small feature with a test over a large untested system.
- Do not commit `src/config/personal.js`, `.env`, or secrets.
- `.cursor/` is gitignored except `.cursor/rules/product-context.mdc`, which always applies so agents load product intent. Durable guidance also lives in this file and `docs/`.

A sibling coordinator may snapshot the working tree to GitHub at quiet checkpoints. Do not `git commit` or `git push` while that loop is running. Use `.cursor/agent-inbox.md` to talk to the coordinator. Write `HOLD` there to pause snapshots.
