# LOCK IN

New tab opens. Who are you becoming, what are the few things that matter today, did you actually do them.

Winter Arc is just a dated stretch of days (116 by default, through Dec 31). You pick an identity, it turns into a daily plan, then you look back at what really happened. Not a habit tracker. Not a todo list. No streak counter trying to parent you.

I built this to use. The whole thing is one loop: **Choose → Plan → Act → Observe → Audit → Learn → Adapt**.

## How it works

Chrome new-tab extension (Manifest V3). What you did lives in an `EventStore` on your laptop. What you *meant* to do does not get to pretend it's the truth.

```text
IDENTITY → GOALS → BEHAVIORS → DAILY PLAN → REAL LIFE
  → OBSERVATION → AUDIT → PATTERNS → EXPERIMENTS → ADAPT
```

| Screen | It's asking |
| --- | --- |
| **Today** | What should I do right now? |
| **Goals** | Who am I becoming? |
| **Arc** | Am I actually changing? |
| **Audit** | What happened? What should I try next? |

The gear in the nav resets the arc: day 1 from today through the end date, and archived/reached goals leave. It asks twice in the app, not a browser popup.

## Screenshots

Fake day. Click a row in [docs/screens.md](docs/screens.md) if you want the longer captions.

<table>
  <tr>
    <td align="center" valign="top" width="50%">
      <p><strong>First open</strong></p>
      <img src="docs/screenshots/landing.png" alt="Winter Arc landing card" />
      <p><sub>Dated window. Then you start.</sub></p>
    </td>
    <td align="center" valign="top" width="50%">
      <p><strong>Today</strong></p>
      <img src="docs/screenshots/today.png" alt="Today screen with three focus actions" />
      <p><sub>A few actions. Repeats stay quiet.</sub></p>
    </td>
  </tr>
  <tr>
    <td align="center" valign="top" width="50%">
      <p><strong>Audit</strong></p>
      <img src="docs/screenshots/audit.png" alt="Audit of kept and missed actions" />
      <p><sub>What happened. Including where the browser went.</sub></p>
    </td>
    <td></td>
  </tr>
</table>

## Setup

1. `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → this folder (the one with `manifest.json`)
4. Open a new tab

Want your own dates/name? Copy `src/config/personal.example.js` to `src/config/personal.js` (gitignored). After a reload, the gear can restart the count from today.

More setup detail: [docs/setup.md](docs/setup.md). How the loop maps: [docs/loop.md](docs/loop.md). What I'm aiming at: [docs/PRODUCT.md](docs/PRODUCT.md).
