# LOCK IN — Master product context

This is the canonical product document for LOCK IN.

**Before changing or building anything in this project, read this file.** It describes what LOCK IN is trying to become. Implementation details may lag this document. When they conflict, move the product toward this document — do not redefine the product around whatever currently exists.

---

## What LOCK IN is

LOCK IN is a personal behavior-change and life-management system for a 116-day Winter Arc.

It helps me become the person I want to be by:

**Choose → Plan → Act → Observe → Audit → Learn → Adapt**

The product should learn from what I actually do, not just what I say I will do.

It is **not** a normal habit tracker, todo list, calendar, or dashboard.

---

## The core problem

I don't need another app that tells me:

- "You have 5 habits today."
- "Your streak is 4 days!"
- "Don't give up!"
- "Here's a dashboard with 30 metrics."

I need a system that helps me answer:

> **Who am I trying to become?**
>
> **What actually matters?**
>
> **What should I do today?**
>
> **Am I actually doing it?**
>
> **Why am I falling off?**
>
> **What should I change?**

The system should reduce decision fatigue and help me stay consistent.

---

## Core philosophy

### 1. Behavior > intentions

The system should eventually compare:

```text
What I planned
vs.
What I actually did
```

Actual behavior is the source of truth.

### 2. Consistency > perfection

Missing a day is normal.

The system should focus on recovery rather than punishment.

Principle:

**Never miss twice.**

### 3. Adaptation > rigid plans

If a plan repeatedly fails, don't simply remind harder.

Ask:

> Is the plan wrong?

Then change it.

### 4. Fewer important actions > huge checklists

Every day should have approximately **3–5 important actions**.

The system should help me know what matters most.

### 5. Evidence > assumptions

The system should distinguish:

```text
FACT
"You completed 2/3 missions."

OBSERVATION
"You've spent more time on distracting sites recently."

HYPOTHESIS
"Your long workdays may be affecting evening goals."

ACTION
"Let's move the difficult task to the morning."
```

Never present guesses as facts.

### 6. The system should learn me

Over time, LOCK IN should discover:

- what environments help me work
- when I have the most energy
- what causes me to fall off
- which interventions work
- which goals compete with each other
- which routines are sustainable
- what behaviors actually move my goals forward

This should eventually become personalized rather than generic.

---

## Product architecture

The conceptual architecture is:

```text
IDENTITY
   ↓
GOALS
   ↓
BEHAVIORS
   ↓
DAILY PLAN
   ↓
REAL LIFE
   ↓
OBSERVATION
   ↓
AUDIT
   ↓
PATTERNS
   ↓
EXPERIMENTS
   ↓
AI COACH
   ↓
ADAPT
   ↺
```

The loop is more important than any individual feature.

---

## Major areas

### TODAY

The question:

> **What should I do right now?**

This is the primary screen.

It should be extremely focused.

Show:

- today's 3–5 priorities
- current focus
- progress through the day
- important context
- one obvious next action

Do not turn it into a metric dashboard.

### GOALS

The question:

> **Who am I becoming and what am I trying to accomplish?**

Goals should represent meaningful outcomes, not tiny habits.

Example:

```text
ATHLETE
Run a half marathon

THINKER
Become genuinely strong at ML

GLOW UP
Build a sustainable appearance/self-care system

EXPLORER
Build a richer life outside work
```

Each goal should eventually contain:

```text
Why
Outcome
Behaviors
Progress
Obstacles
Experiments
```

### ARC

The question:

> **Am I actually changing?**

This is the emotional overview of the Winter Arc.

It should show meaningful progress across the 116 days.

It should feel motivating and beautiful, not like a spreadsheet.

### AUDIT

The question:

> **What actually happened?**

Use real events and behavior.

Show:

- what went well
- what was missed
- behavioral patterns
- important changes
- one useful takeaway

Avoid excessive metrics.

### COACH

The question:

> **What should I do differently?**

The AI Coach should eventually reason across:

- identity
- goals
- behavior
- audits
- browser activity
- fitness
- food
- experiments
- interventions

It should prioritize rather than overwhelm.

The Coach should be:

**smart + honest + concise + personalized + actionable.**

### EXPERIMENTS

The question:

> **What should I try to learn about myself?**

Instead of pretending the system knows the perfect routine, it can test hypotheses.

Example:

```text
Hypothesis:
Morning workouts improve my energy.

Experiment:
Do morning workouts for 7 days.

Measure:
Workout completion
Evening energy

Result:
Evaluate whether it worked.

Decision:
Keep / modify / discard
```

This is a major part of making LOCK IN scientifically useful.

---

## Design philosophy

LOCK IN should feel:

- premium
- calm
- cinematic
- intelligent
- futuristic
- personal
- slightly feminine but not stereotypically feminine
- motivating without being cheesy

Avoid:

- generic SaaS dashboards
- excessive cards
- rainbow gradients
- childish gamification
- giant progress bars everywhere
- motivational quotes
- "girlboss" aesthetics
- notification spam
- overwhelming charts

The interface should make me **want to open it**.

---

## Technical philosophy

Build incrementally.

Prefer:

```text
small feature
→ test
→ use
→ learn
→ improve
```

over building a huge system upfront.

Keep:

- local-first where possible
- modular architecture
- clear separation between data, logic, AI, and UI
- existing EventStore as the behavioral source of truth

Do not introduce infrastructure unless the feature genuinely requires it.

---

## Most important product principle

When deciding whether to build something, ask:

> **Does this help me make better decisions about my life and actually follow through?**

If not, don't build it.

LOCK IN should ultimately feel less like an app I have to manage and more like a **personal operating system that helps me manage myself.**
