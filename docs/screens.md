# Screens

Same fake day as the README. Open one like a tab.

[First open](#first-open) · [Today](#today) · [Coach](#coach) · [Audit](#audit)

Goals and Arc don't have shots in this set. What they do: [loop.md](loop.md).

<details open id="first-open">
<summary><strong>First open</strong></summary>

<p><sub>Dated window. Then you start.</sub></p>

![Winter Arc landing](screenshots/landing.png)

The new-tab card before you've started. Default arc is 116 days, Sep 7 to Dec 31. Copy `src/config/personal.example.js` to `personal.js` if you want different dates or a name.

</details>

<details id="today">
<summary><strong>Today</strong></summary>

<p><sub>A few actions. Repeats stay quiet.</sub></p>

![Today](screenshots/today.png)

Primary screen. About three things that matter, quieter every-day repeats, a couple of extra bits, cues while Chrome is open. Start runs one action at a time. Not a metrics dashboard.

</details>

<details id="coach">
<summary><strong>Coach</strong></summary>

<p><sub>Noticed something. You can push back.</sub></p>

![Coach](screenshots/coach.png)

Optional. Local Python on `127.0.0.1:8787` gets about a week of context and comes back with one observation, a pattern, a next action, and a proposed change to tomorrow. Chat is the same bound. Key never enters the extension. How to turn it on: [setup.md](setup.md).

</details>

<details id="audit">
<summary><strong>Audit</strong></summary>

<p><sub>What happened. Including where the browser went.</sub></p>

![Audit](screenshots/audit.png)

Kept vs slipped, a pattern if there are enough days, sleep/energy/fitness check-ins, observed browser time for that day and a few before. After three misses of the same behavior it asks if the plan was unrealistic. Experiment results land here too (there's no Experiments tab yet).

</details>
