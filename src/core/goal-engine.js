(function initializeGoalEngine(globalScope) {
  "use strict";

  const GOAL_VERSION = 2;
  const BEHAVIOR_VERSION = 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ACTIVE_STATUSES = new Set(["active", "in-progress"]);
  const PAUSED_STATUS = "paused";
  const FINAL_STATUSES = new Set(["completed", "cancelled", "archived"]);
  const GOAL_STATUSES = new Set([
    "active",
    "in-progress",
    "paused",
    "completed",
    "cancelled",
    "archived",
  ]);
  const BEHAVIOR_STATUSES = new Set(["active", "paused", "archived"]);
  const BEHAVIOR_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

  const IDENTITY_CATALOG = Object.freeze({
    athlete: Object.freeze({
      id: "athlete",
      label: "Athlete",
      icon: "🏃",
      aspiration: "Move and care for your body",
    }),
    thinker: Object.freeze({
      id: "thinker",
      label: "Thinker",
      icon: "🧠",
      aspiration: "Learn, reflect, and stay curious",
    }),
    builder: Object.freeze({
      id: "builder",
      label: "Builder",
      icon: "💻",
      aspiration: "Make things that matter",
    }),
    "glow-up": Object.freeze({
      id: "glow-up",
      label: "Glow up",
      icon: "✨",
      aspiration: "How you feel and present",
    }),
    explorer: Object.freeze({
      id: "explorer",
      label: "Explorer",
      icon: "🌎",
      aspiration: "New places, ideas, experiences",
    }),
    connected: Object.freeze({
      id: "connected",
      label: "Connected",
      icon: "🫶",
      aspiration: "Invest in people and community",
    }),
  });

  const AREA_TO_IDENTITY = Object.freeze({
    fitness: "athlete",
    "health-food": "athlete",
    "energy-recovery": "athlete",
    mind: "thinker",
    career: "builder",
    appearance: "glow-up",
    environment: "explorer",
    "social-life": "connected",
    "digital-life": "thinker",
  });

  const FOCUS_THEMES = Object.freeze(["ENERGY", "FOCUS", "RECOVERY", "CONSISTENCY"]);

  const DEFAULT_PRIVATE_CONFIG = Object.freeze({
    version: 1,
    milestoneLookaheadDays: 30,
    defaultPreparationWindowDays: 14,
    weights: Object.freeze({
      urgency: 4,
      frequency: 3,
      neglect: 2,
      milestone: 5,
      rotation: 1,
    }),
  });

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function parseDate(value) {
    if (value instanceof Date) {
      const copy = new Date(value.getTime());
      return Number.isNaN(copy.getTime()) ? null : copy;
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      return date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
        ? date
        : null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDateKey(value) {
    const date = parseDate(value);
    if (!date) return null;
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function startOfDay(value) {
    const date = parseDate(value);
    if (!date) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function endOfDay(value) {
    const date = startOfDay(value);
    if (!date) return null;
    date.setHours(23, 59, 59, 999);
    return date;
  }

  function addDays(value, amount) {
    const date = startOfDay(value);
    if (!date || !Number.isFinite(Number(amount))) return null;
    date.setDate(date.getDate() + Number(amount));
    return date;
  }

  function calendarSerial(value) {
    const date = parseDate(value);
    return date
      ? Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
      : NaN;
  }

  function differenceInCalendarDays(later, earlier) {
    const difference = calendarSerial(later) - calendarSerial(earlier);
    return Number.isFinite(difference) ? difference : NaN;
  }

  function isWithinDateRange(value, start, end) {
    const current = calendarSerial(value);
    const first = calendarSerial(start);
    const last = calendarSerial(end);
    return (
      Number.isFinite(current) &&
      Number.isFinite(first) &&
      Number.isFinite(last) &&
      current >= first &&
      current <= last
    );
  }

  function getDateArc(start, end, date = new Date()) {
    const totalDays = differenceInCalendarDays(end, start);
    const elapsedDays = differenceInCalendarDays(date, start);
    if (!Number.isFinite(totalDays) || totalDays < 0 || !Number.isFinite(elapsedDays)) {
      return { valid: false, phase: "invalid", elapsedDays: 0, totalDays: 0, progress: 0 };
    }
    const phase = elapsedDays < 0 ? "upcoming" : elapsedDays > totalDays ? "past" : "active";
    return {
      valid: true,
      phase,
      elapsedDays: clamp(elapsedDays, 0, totalDays),
      totalDays,
      progress: totalDays === 0 ? (elapsedDays >= 0 ? 1 : 0) : clamp(elapsedDays / totalDays, 0, 1),
    };
  }

  function identityFromArea(area) {
    const key = text(area).toLowerCase();
    return AREA_TO_IDENTITY[key] || (IDENTITY_CATALOG[key] ? key : "builder");
  }

  function areaFromIdentity(identityId) {
    const reverse = {
      athlete: "fitness",
      thinker: "mind",
      builder: "career",
      "glow-up": "appearance",
      explorer: "environment",
      connected: "social-life",
    };
    return reverse[identityId] || "";
  }

  function categoryFromIdentity(identityId) {
    return IDENTITY_CATALOG[identityId]?.label || "";
  }

  function identityFromCategory(category, area) {
    const requested = text(category).toLowerCase();
    if (IDENTITY_CATALOG[requested]) return requested;
    const match = Object.values(IDENTITY_CATALOG).find(
      (identity) => identity.label.toLowerCase() === requested,
    );
    if (match) return match.id;
    return identityFromArea(area);
  }

  function goalTitle(source, outcome = "") {
    return text(source?.title) || text(outcome) || text(source?.outcome);
  }

  function normalizeObstacles(source) {
    const listed = Array.isArray(source?.obstacles)
      ? source.obstacles.map((item) => text(item)).filter(Boolean)
      : [];
    if (listed.length) return listed;
    const single = text(source?.obstacle);
    return single ? [single] : [];
  }

  function isPlannableGoal(goal) {
    return ACTIVE_STATUSES.has(text(goal?.status).toLowerCase());
  }

  function resolveIdentityId(source, area) {
    const explicit = text(source?.identityId).toLowerCase();
    if (IDENTITY_CATALOG[explicit]) return explicit;
    return identityFromCategory(source?.category, area);
  }

  function hasUsableMetric(metric) {
    return Boolean(metric && text(metric.unit) && metric.target !== metric.baseline);
  }

  function normalizeMetric(metricInput) {
    const metric = isObject(metricInput) ? metricInput : {};
    return {
      baseline: finiteNumber(metric.baseline),
      target: finiteNumber(metric.target),
      current: finiteNumber(metric.current, finiteNumber(metric.baseline)),
      unit: text(metric.unit),
    };
  }

  function behaviorTitle(source) {
    return text(source?.title) || text(source?.standard) || text(source?.minimum);
  }

  function normalizeDifficulty(value, fallback = "medium") {
    const key = text(value).toLowerCase();
    if (BEHAVIOR_DIFFICULTIES.has(key)) return key;
    const inherited = text(fallback).toLowerCase();
    return BEHAVIOR_DIFFICULTIES.has(inherited) ? inherited : "medium";
  }

  function normalizeBehaviorStatus(value, fallback = "active") {
    const key = text(value).toLowerCase();
    if (BEHAVIOR_STATUSES.has(key)) return key;
    const inherited = text(fallback).toLowerCase();
    return BEHAVIOR_STATUSES.has(inherited) ? inherited : "active";
  }

  function isPlannableBehavior(behavior) {
    const status = normalizeBehaviorStatus(behavior?.status);
    return status === "active" && Boolean(behaviorTitle(behavior));
  }

  function normalizeBehaviorRecord(input, fallback = {}, now = null) {
    const source = isObject(input) ? input : {};
    const cueSource = isObject(source.cue)
      ? source.cue
      : isObject(fallback.cue)
        ? fallback.cue
        : {};
    const friction = isObject(source.friction) ? source.friction : {};
    const schedule = isObject(source.schedule) ? source.schedule : {};
    const nowDate = parseDate(now) || new Date(0);
    const goalId = text(source.goalId) || text(fallback.goalId);
    const title = behaviorTitle(source) || behaviorTitle(fallback);
    const generatedId = `${goalId}-${title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const frequency = clamp(
      Math.round(
        finiteNumber(
          source.frequency,
          finiteNumber(schedule.daysPerWeek, fallback.frequency ?? fallback.daysPerWeek),
        ),
      ),
      0,
      7,
    );
    return {
      version: BEHAVIOR_VERSION,
      id: text(source.id) || `behavior-${generatedId || "untitled"}`,
      goalId,
      title,
      description: text(source.description) || text(fallback.description),
      frequency,
      difficulty: normalizeDifficulty(source.difficulty, fallback.difficulty),
      status: normalizeBehaviorStatus(source.status, fallback.status),
      standard: title,
      minimum: text(source.minimum) || text(fallback.minimum),
      stretch: text(source.stretch) || text(fallback.stretch),
      cue: {
        trigger: text(cueSource.trigger),
        time: text(cueSource.time),
        place: text(cueSource.place),
      },
      schedule: {
        daysPerWeek: frequency,
      },
      friction: {
        obstacle: text(friction.obstacle) || text(fallback.obstacle),
        recoveryPlan: text(friction.recoveryPlan) || text(fallback.recoveryPlan),
      },
      timestamps: {
        createdAt:
          parseDate(source.timestamps?.createdAt)?.toISOString() || nowDate.toISOString(),
        updatedAt:
          parseDate(source.timestamps?.updatedAt)?.toISOString() || nowDate.toISOString(),
      },
    };
  }

  function extractBehaviorsFromGoal(input, now = null) {
    const source = isObject(input) ? input : {};
    const listed = Array.isArray(source.behaviors) ? source.behaviors : [];
    const area = text(source.area);
    const identityId = resolveIdentityId(source, area);
    const outcome = text(source.outcome);
    const title = goalTitle(source, outcome);
    const generatedId = `${identityId || area}-${title || outcome}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const goalId = text(source.id) || `goal-${generatedId || "untitled"}`;
    const actions = isObject(source.actions) ? source.actions : {};
    const cue = isObject(source.cue) ? source.cue : {};
    const fallback = {
      goalId,
      standard: text(actions.standard),
      minimum: text(actions.minimum),
      stretch: text(actions.stretch),
      cue,
      daysPerWeek: finiteNumber(source.frequencyPerWeek),
      obstacle: text(source.obstacle),
      recoveryPlan: text(source.recoveryPlan),
    };
    if (listed.length) {
      const normalized = listed
        .map((behavior, index) => {
          const record = typeof behavior === "string" ? { standard: text(behavior) } : behavior;
          return normalizeBehaviorRecord(
            {
              ...record,
              id: text(record?.id) || `${goalId}-behavior-${index}`,
              goalId,
              title:
                text(record?.title) ||
                text(record?.standard) ||
                text(behavior),
              standard:
                text(record?.standard) || text(record?.title) || text(behavior),
            },
            fallback,
            now,
          );
        })
        .filter((behavior) => behaviorTitle(behavior));
      if (normalized.length) return normalized;
    }
    if (!behaviorTitle(fallback) && !text(fallback.minimum)) return [];
    return [
      normalizeBehaviorRecord(
        { id: `${goalId}-behavior-primary`, goalId },
        fallback,
        now,
      ),
    ];
  }

  function normalizeGoalRecord(input, now = null) {
    const source = isObject(input) ? input : {};
    const cue = isObject(source.cue) ? source.cue : {};
    const actions = isObject(source.actions) ? source.actions : {};
    const timestamps = isObject(source.timestamps) ? source.timestamps : {};
    const area = text(source.area);
    const identityId = resolveIdentityId(source, area);
    const outcome = text(source.outcome);
    const title = goalTitle(source, outcome);
    const generatedId = `${identityId || area}-${title || outcome}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nowDate =
      parseDate(now) ||
      parseDate(timestamps.updatedAt) ||
      parseDate(timestamps.createdAt) ||
      new Date(0);
    const nowIso = nowDate.toISOString();
    const targetDate = formatDateKey(source.targetDate) || formatDateKey(source.deadline);
    const status = GOAL_STATUSES.has(text(source.status).toLowerCase())
      ? text(source.status).toLowerCase()
      : "active";
    const behaviors = extractBehaviorsFromGoal(source, nowDate);
    const primary = behaviors[0];
    const obstacles = normalizeObstacles({
      ...source,
      obstacle: text(source.obstacle) || text(primary?.friction?.obstacle),
    });

    return {
      version: GOAL_VERSION,
      id: text(source.id) || `goal-${generatedId || "untitled"}`,
      identityId,
      category: text(source.category) || categoryFromIdentity(identityId),
      area: area || areaFromIdentity(identityId),
      title,
      outcome: outcome || title,
      why: text(source.why),
      metric: normalizeMetric(source.metric),
      deadline: targetDate,
      targetDate,
      frequencyPerWeek: clamp(
        Math.round(
          finiteNumber(
            source.frequencyPerWeek,
            primary?.frequency || primary?.schedule?.daysPerWeek || 0,
          ),
        ),
        0,
        7,
      ),
      cue: {
        trigger: text(cue.trigger) || text(primary?.cue?.trigger),
        time: text(cue.time) || text(primary?.cue?.time),
        place: text(cue.place) || text(primary?.cue?.place),
      },
      actions: {
        minimum: text(actions.minimum) || text(primary?.minimum),
        standard: text(actions.standard) || text(primary?.title) || text(primary?.standard),
        stretch: text(actions.stretch) || text(primary?.stretch),
      },
      behaviors,
      obstacle: obstacles[0] || "",
      obstacles,
      recoveryPlan: text(source.recoveryPlan) || text(primary?.friction?.recoveryPlan),
      reward: text(source.reward),
      status: status || "active",
      timestamps: {
        createdAt: parseDate(timestamps.createdAt)?.toISOString() || nowIso,
        updatedAt: parseDate(timestamps.updatedAt)?.toISOString() || nowIso,
      },
    };
  }

  function validateGoalRecord(input, now = null) {
    const source = isObject(input) ? input : {};
    const goal = normalizeGoalRecord(input, now);
    const errors = [];
    if (!isObject(input)) errors.push("Goal must be an object.");
    if (goal.version !== GOAL_VERSION) errors.push(`Unsupported goal version: ${goal.version}.`);
    if (!goal.identityId || !IDENTITY_CATALOG[goal.identityId]) {
      errors.push("identityId or category is required.");
    }
    if (!goal.area) errors.push("area is required.");
    if (!goal.title && !goal.outcome) errors.push("title is required.");
    if (!goal.why) errors.push("why is required.");
    if (goal.metric.unit && goal.metric.target === goal.metric.baseline) {
      errors.push("metric.target must differ from metric.baseline.");
    }
    const requestedDate = text(source.targetDate) || text(source.deadline);
    if (requestedDate && !goal.targetDate) {
      errors.push("targetDate must be a valid date.");
    }
    const hasBehavior = (goal.behaviors || []).some((behavior) => behaviorTitle(behavior));
    if (!hasBehavior) errors.push("at least one behavior is required.");
    if (!goal.timestamps.createdAt || !goal.timestamps.updatedAt) {
      errors.push("timestamps must be valid.");
    }
    return { valid: errors.length === 0, errors, value: goal, goal };
  }

  function calculateSMARTCompleteness(input) {
    const goal = normalizeGoalRecord(input, new Date(0));
    const criteria = {
      specific: Boolean(
        goal.area &&
          goal.outcome &&
          goal.actions.standard &&
          goal.cue.trigger &&
          goal.cue.place,
      ),
      measurable: Boolean(
        goal.metric.unit &&
          Number.isFinite(goal.metric.baseline) &&
          Number.isFinite(goal.metric.target) &&
          goal.metric.baseline !== goal.metric.target,
      ),
      achievable: Boolean(goal.actions.minimum && goal.frequencyPerWeek >= 1),
      relevant: Boolean(goal.why),
      timeBound: Boolean(goal.deadline),
    };
    const completed = Object.values(criteria).filter(Boolean).length;
    return { score: completed / 5, percent: completed * 20, completed, total: 5, criteria };
  }

  function validatePrivateConfig(input) {
    const errors = [];
    if (!isObject(input)) {
      return { valid: false, errors: ["Config must be an object."], config: DEFAULT_PRIVATE_CONFIG };
    }
    const weights = input.weights;
    const integerFields = ["milestoneLookaheadDays", "defaultPreparationWindowDays"];
    if (input.version !== DEFAULT_PRIVATE_CONFIG.version) errors.push("Unsupported config version.");
    integerFields.forEach((field) => {
      if (!Number.isInteger(input[field]) || input[field] < 0) errors.push(`${field} must be non-negative.`);
    });
    if (!isObject(weights)) {
      errors.push("weights must be an object.");
    } else {
      Object.keys(DEFAULT_PRIVATE_CONFIG.weights).forEach((field) => {
        if (!Number.isFinite(weights[field]) || weights[field] < 0) {
          errors.push(`weights.${field} must be non-negative.`);
        }
      });
    }
    if (errors.length) return { valid: false, errors, config: DEFAULT_PRIVATE_CONFIG };
    return {
      valid: true,
      errors: [],
      config: {
        version: input.version,
        milestoneLookaheadDays: input.milestoneLookaheadDays,
        defaultPreparationWindowDays: input.defaultPreparationWindowDays,
        weights: { ...weights },
      },
    };
  }

  function validatePersonalConfig(input) {
    const errors = [];
    if (!isObject(input)) {
      return {
        valid: false,
        errors: ["Personal config must be an object."],
        config: { schemaVersion: 1, displayName: "", arc: null, milestones: [], attentionDomains: [] },
      };
    }
    if (input.schemaVersion !== 1) {
      errors.push("Unsupported personal config schemaVersion.");
    }
    const arc = isObject(input.arc) ? input.arc : null;
    if (
      arc &&
      (!formatDateKey(arc.start) ||
        !formatDateKey(arc.end) ||
        differenceInCalendarDays(arc.end, arc.start) < 0)
    ) {
      errors.push("arc must have valid start and end dates.");
    }
    const milestones = Array.isArray(input.milestones) ? input.milestones : [];
    milestones.forEach((milestone, index) => {
      if (!text(milestone?.id) || !text(milestone?.label)) {
        errors.push(`milestones[${index}] requires id and label.`);
      }
      if (!formatDateKey(milestone?.date)) {
        errors.push(`milestones[${index}] requires a valid date.`);
      }
      if (
        milestone?.preparationWindows !== undefined &&
        !Array.isArray(milestone.preparationWindows)
      ) {
        errors.push(`milestones[${index}].preparationWindows must be an array.`);
      }
    });
    const attentionDomains = Array.isArray(input.attentionDomains)
      ? input.attentionDomains.filter((domain) => text(domain))
      : [];
    const config = errors.length
      ? { schemaVersion: 1, displayName: "", arc: null, milestones: [], attentionDomains: [] }
      : {
          schemaVersion: 1,
          displayName: text(input.displayName),
          arc,
          milestones,
          attentionDomains,
        };
    return { valid: errors.length === 0, errors, config };
  }

  function milestoneDate(milestone) {
    return milestone?.date ?? milestone?.deadline ?? milestone?.dueDate;
  }

  function milestoneId(milestone, index = 0) {
    return text(milestone?.id) || `milestone-${formatDateKey(milestoneDate(milestone)) || "undated"}-${index}`;
  }

  function isOpen(item) {
    return !FINAL_STATUSES.has(text(item?.status).toLowerCase());
  }

  function preparationDays(milestone, fallback = DEFAULT_PRIVATE_CONFIG.defaultPreparationWindowDays) {
    const value = finiteNumber(
      milestone?.preparationWindowDays ?? milestone?.preparationDays,
      fallback,
    );
    return Math.max(0, Math.round(value));
  }

  function chooseActiveMilestones(milestones, date = new Date(0)) {
    return (Array.isArray(milestones) ? milestones : [])
      .filter((milestone) => {
        const due = milestoneDate(milestone);
        const daysUntil = differenceInCalendarDays(due, date);
        return (
          isOpen(milestone) &&
          Number.isFinite(daysUntil) &&
          daysUntil >= 0 &&
          daysUntil <= preparationDays(milestone)
        );
      })
      .sort((a, b) => {
        const difference = differenceInCalendarDays(milestoneDate(a), milestoneDate(b));
        return difference || milestoneId(a).localeCompare(milestoneId(b));
      });
  }

  function chooseUpcomingMilestones(
    milestones,
    date = new Date(0),
    lookaheadDays = DEFAULT_PRIVATE_CONFIG.milestoneLookaheadDays,
  ) {
    return (Array.isArray(milestones) ? milestones : [])
      .filter((milestone) => {
        const daysUntil = differenceInCalendarDays(milestoneDate(milestone), date);
        return (
          isOpen(milestone) &&
          Number.isFinite(daysUntil) &&
          daysUntil > preparationDays(milestone) &&
          daysUntil <= Math.max(0, finiteNumber(lookaheadDays))
        );
      })
      .sort((a, b) => {
        const difference = differenceInCalendarDays(milestoneDate(a), milestoneDate(b));
        return difference || milestoneId(a).localeCompare(milestoneId(b));
      });
  }

  function taskWindowMatches(task, daysUntil) {
    const start = Math.max(
      0,
      finiteNumber(task?.startDaysBefore ?? task?.windowDays ?? task?.daysBefore, 0),
    );
    const end = Math.max(0, finiteNumber(task?.endDaysBefore, 0));
    return daysUntil <= Math.max(start, end) && daysUntil >= Math.min(start, end);
  }

  function chooseMilestoneTasks(milestones, date = new Date(0)) {
    const selected = [];
    (Array.isArray(milestones) ? milestones : []).forEach((milestone, milestoneIndex) => {
      if (!isOpen(milestone)) return;
      const daysUntil = differenceInCalendarDays(milestoneDate(milestone), date);
      if (!Number.isFinite(daysUntil) || daysUntil < 0) return;
      const tasks = Array.isArray(milestone.tasks) ? milestone.tasks : [];
      tasks.forEach((task, taskIndex) => {
        if (isOpen(task) && taskWindowMatches(task, daysUntil)) {
          selected.push({
            ...task,
            id: text(task.id) || `${milestoneId(milestone, milestoneIndex)}-task-${taskIndex}`,
            milestoneId: milestoneId(milestone, milestoneIndex),
            goalId: text(task.goalId) || text(milestone.goalId),
            milestoneDate: formatDateKey(milestoneDate(milestone)),
            daysUntil,
          });
        }
      });
      const windows = Array.isArray(milestone.preparationWindows)
        ? milestone.preparationWindows
        : [];
      windows.forEach((window, windowIndex) => {
        if (!taskWindowMatches(window, daysUntil)) return;
        const windowTasks = Array.isArray(window.tasks) ? window.tasks : [];
        windowTasks.forEach((task, taskIndex) => {
          if (isOpen(task)) {
            selected.push({
              ...task,
              id:
                text(task.id) ||
                `${milestoneId(milestone, milestoneIndex)}-window-${windowIndex}-${taskIndex}`,
              milestoneId: milestoneId(milestone, milestoneIndex),
              goalId: text(task.goalId) || text(milestone.goalId),
              milestoneDate: formatDateKey(milestoneDate(milestone)),
              daysUntil,
            });
          }
        });
      });
    });
    return selected.sort(
      (a, b) => a.daysUntil - b.daysUntil || String(a.id).localeCompare(String(b.id)),
    );
  }

  function historyDate(entry) {
    return entry?.date ?? entry?.timestamp ?? entry?.completedAt ?? entry?.plannedAt;
  }

  function historyGoalId(entry) {
    return text(entry?.goalId) || text(entry?.mission?.goalId);
  }

  function wasCompleted(entry) {
    const status = text(entry?.status).toLowerCase();
    return entry?.completed === true || status === "completed" || status === "done";
  }

  function startOfWeek(value) {
    const date = startOfDay(value);
    if (!date) return null;
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    return date;
  }

  function historyBehaviorId(entry) {
    return text(entry?.behaviorId) || text(entry?.mission?.behaviorId);
  }

  function selectDailyMissions(goals, history, milestones, date, limit = 3) {
    const today = startOfDay(date);
    if (!today) return [];
    const safeHistory = Array.isArray(history) ? history : [];
    const safeMilestones = Array.isArray(milestones) ? milestones : [];
    const weekStart = startOfWeek(today);
    const normalizedGoals = (Array.isArray(goals) ? goals : []).map((input, index) => ({
      goal: normalizeGoalRecord(input, today),
      input,
      index,
    }));
    const areasByGoalId = new Map(
      normalizedGoals.map(({ goal }) => [goal.id, goal.area]),
    );
    const milestoneTasks = chooseMilestoneTasks(safeMilestones, today);
    const recentAreas = new Map();
    safeHistory.forEach((entry) => {
      const age = differenceInCalendarDays(today, historyDate(entry));
      const area = text(entry.area) || areasByGoalId.get(historyGoalId(entry)) || "";
      if (area && age >= 0 && age <= 6) recentAreas.set(area, (recentAreas.get(area) || 0) + 1);
    });

    const candidates = [];
    normalizedGoals.forEach(({ goal, input, index }) => {
      if (!isPlannableGoal(goal)) return;
      const behaviors = extractBehaviorsFromGoal({ ...input, ...goal, id: goal.id }, today).filter(
        isPlannableBehavior,
      );
      if (!behaviors.length) return;
      const goalHistory = safeHistory.filter((entry) => historyGoalId(entry) === goal.id);
      const relatedTasks = milestoneTasks.filter((task) => task.goalId === goal.id);
      const relatedMilestoneDays = safeMilestones
        .filter(
          (milestone) =>
            isOpen(milestone) && text(milestone.goalId) === goal.id,
        )
        .map((milestone) => differenceInCalendarDays(milestoneDate(milestone), today))
        .filter(
          (days) =>
            Number.isFinite(days) &&
            days >= 0 &&
            days <= DEFAULT_PRIVATE_CONFIG.milestoneLookaheadDays,
        );
      const nearestMilestone = relatedMilestoneDays.length
        ? Math.min(...relatedMilestoneDays)
        : Infinity;
      const milestoneScore = Number.isFinite(nearestMilestone)
        ? 1 / (nearestMilestone + 1)
        : 0;
      const targetDate = goal.targetDate || goal.deadline;
      const daysToDeadline = targetDate
        ? differenceInCalendarDays(targetDate, today)
        : Number.POSITIVE_INFINITY;
      const urgency = !Number.isFinite(daysToDeadline)
        ? 0
        : daysToDeadline < 0
          ? 1 + Math.min(Math.abs(daysToDeadline), 30) / 30
          : 1 / (daysToDeadline + 1);
      const rotationScore = 1 / ((recentAreas.get(goal.area) || 0) + 1);

      behaviors.forEach((behavior, behaviorIndex) => {
        const behaviorHistory = goalHistory.filter((entry) => {
          const entryBehavior = historyBehaviorId(entry);
          return !entryBehavior || entryBehavior === behavior.id;
        });
        const weekCompletions = behaviorHistory.filter(
          (entry) =>
            wasCompleted(entry) &&
            isWithinDateRange(historyDate(entry), weekStart, endOfDay(today)),
        ).length;
        const mostRecent = behaviorHistory
          .filter(wasCompleted)
          .map(historyDate)
          .filter((value) => parseDate(value))
          .sort((a, b) => calendarSerial(b) - calendarSerial(a))[0];
        const neglectedDays = mostRecent
          ? Math.max(0, differenceInCalendarDays(today, mostRecent))
          : 7;
        const weeklyTarget = Math.max(
          1,
          finiteNumber(
            behavior.frequency,
            finiteNumber(behavior.schedule?.daysPerWeek, goal.frequencyPerWeek || 1),
          ),
        );
        const frequencyDeficit = Math.max(0, weeklyTarget - weekCompletions);
        const score =
          DEFAULT_PRIVATE_CONFIG.weights.urgency * urgency +
          DEFAULT_PRIVATE_CONFIG.weights.frequency * frequencyDeficit +
          DEFAULT_PRIVATE_CONFIG.weights.neglect * (Math.min(neglectedDays, 14) / 14) +
          DEFAULT_PRIVATE_CONFIG.weights.milestone * milestoneScore +
          DEFAULT_PRIVATE_CONFIG.weights.rotation * rotationScore;
        candidates.push({
          id:
            behaviorIndex === 0
              ? `${formatDateKey(today)}:${goal.id}`
              : `${formatDateKey(today)}:${goal.id}:${behavior.id}`,
          goalId: goal.id,
          identityId: goal.identityId,
          behaviorId: behavior.id,
          area: goal.area,
          category: goal.category,
          goalTitle: goal.title || goal.outcome,
          outcome: goal.outcome,
          action: behaviorTitle(behavior),
          minimumAction: behavior.minimum || goal.actions.minimum,
          score,
          daysToDeadline,
          frequencyRemaining: frequencyDeficit,
          milestoneTasks: relatedTasks,
          index,
          behaviorIndex,
        });
      });
    });

    const max = clamp(Math.floor(finiteNumber(limit, 3)), 0, 3);
    const ranked = candidates.sort(
      (a, b) =>
        b.score - a.score ||
        a.daysToDeadline - b.daysToDeadline ||
        a.goalId.localeCompare(b.goalId) ||
        a.behaviorIndex - b.behaviorIndex ||
        a.index - b.index,
    );
    const picked = [];
    const usedGoals = new Set();
    ranked.forEach((candidate) => {
      if (picked.length >= max || usedGoals.has(candidate.goalId)) return;
      picked.push(candidate);
      usedGoals.add(candidate.goalId);
    });
    ranked.forEach((candidate) => {
      if (picked.length >= max) return;
      if (picked.some((item) => item.id === candidate.id)) return;
      picked.push(candidate);
    });
    return picked.map(({ index, behaviorIndex, ...mission }) => mission);
  }

  function calculateWeeklyConsistency(opportunities, weekStart, weekEnd) {
    const entries = Array.isArray(opportunities) ? opportunities : [];
    const start = weekStart ? startOfDay(weekStart) : null;
    const end = weekEnd ? endOfDay(weekEnd) : start ? endOfDay(addDays(start, 6)) : null;
    const relevant = entries.filter((entry) => {
      if (entry?.planned === false) return false;
      if (!start || !end) return true;
      return isWithinDateRange(historyDate(entry), start, end);
    });
    const completed = relevant.filter(wasCompleted).length;
    const planned = relevant.length;
    return {
      completed,
      planned,
      missed: planned - completed,
      rate: planned ? completed / planned : 0,
      percent: planned ? Math.round((completed / planned) * 100) : 0,
    };
  }

  function buildLapseRecovery(goalInput, lapse = {}) {
    const goal = normalizeGoalRecord(goalInput, parseDate(lapse.date) || new Date(0));
    const missedCount = Math.max(1, Math.round(finiteNumber(lapse.missedCount, 1)));
    const nextDate = formatDateKey(lapse.nextDate ?? addDays(lapse.date ?? new Date(0), 1));
    return {
      goalId: goal.id,
      tone: "supportive",
      missedCount,
      acknowledgement:
        missedCount === 1
          ? "One missed opportunity does not erase your progress."
          : "A difficult stretch does not erase your progress.",
      nextAction: goal.actions.minimum || goal.actions.standard,
      recoveryPlan:
        goal.recoveryPlan ||
        "Restart with the smallest useful action, then return to the normal rhythm.",
      cue: { ...goal.cue },
      nextDate,
      message: `Restart gently with: ${goal.actions.minimum || goal.actions.standard}.`,
    };
  }

  function migrateGoalCollection(goals, now = null) {
    const list = Array.isArray(goals) ? goals : [];
    const normalizedGoals = [];
    const behaviors = [];
    list.forEach((input) => {
      const goal = normalizeGoalRecord(input, now);
      normalizedGoals.push(goal);
      extractBehaviorsFromGoal({ ...input, ...goal, id: goal.id }, now).forEach(
        (behavior) => behaviors.push(behavior),
      );
    });
    return { goals: normalizedGoals, behaviors };
  }

  function calculateGoalReadiness(input) {
    const goal = normalizeGoalRecord(input, new Date(0));
    const behaviors = extractBehaviorsFromGoal(input, new Date(0));
    const criteria = {
      why: Boolean(goal.why),
      behavior: behaviors.some((item) => behaviorTitle(item)),
      notice: Boolean(goal.targetDate || goal.deadline || hasUsableMetric(goal.metric)),
    };
    const completed = Object.values(criteria).filter(Boolean).length;
    return {
      ready: completed === 3,
      completed,
      total: 3,
      criteria,
      summary: criteria.why && criteria.behavior && criteria.notice
        ? "This goal has a why, a behavior, and a way to notice if it worked."
        : "Add a why, a behavior, and a way to notice progress.",
    };
  }

  function wasPlannedOpportunity(entry) {
    return entry?.planned !== false;
  }

  function wasRecoveryOrComplete(entry) {
    const level = text(entry?.level).toLowerCase();
    return (
      wasCompleted(entry) ||
      level === "minimum" ||
      entry?.recovery === true
    );
  }

  function calculateFollowThrough(history, date = new Date()) {
    const today = startOfDay(date);
    if (!today) return { days: 0, ended: false };
    const entries = Array.isArray(history) ? history : [];
    let days = 0;
    for (let offset = 0; offset < 120; offset += 1) {
      const cursor = addDays(today, -offset);
      const key = formatDateKey(cursor);
      const dayEntries = entries.filter(
        (entry) => formatDateKey(historyDate(entry)) === key && wasPlannedOpportunity(entry),
      );
      if (!dayEntries.length) {
        if (offset === 0) continue;
        break;
      }
      if (dayEntries.some(wasRecoveryOrComplete)) {
        days += 1;
        continue;
      }
      break;
    }
    return { days, ended: false };
  }

  function countConsecutiveMisses(history, goalId, date = new Date()) {
    const today = startOfDay(date);
    if (!today) return 0;
    const entries = (Array.isArray(history) ? history : []).filter(
      (entry) => historyGoalId(entry) === goalId && wasPlannedOpportunity(entry),
    );
    let missed = 0;
    for (let offset = 0; offset < 21; offset += 1) {
      const key = formatDateKey(addDays(today, -offset));
      const dayEntries = entries.filter((entry) => formatDateKey(historyDate(entry)) === key);
      if (!dayEntries.length) {
        if (offset === 0) continue;
        break;
      }
      if (dayEntries.some(wasCompleted)) break;
      missed += 1;
    }
    return missed;
  }

  function deriveFocusTheme({
    recentEnergy = [],
    recentSleep = [],
    consecutiveMisses = 0,
    activeExperiment = null,
  } = {}) {
    if (activeExperiment?.hypothesis) {
      const hypothesis = text(activeExperiment.hypothesis).toUpperCase();
      if (hypothesis.includes("ENERGY")) return "ENERGY";
      if (hypothesis.includes("FOCUS") || hypothesis.includes("DEEP")) return "FOCUS";
      if (hypothesis.includes("RECOVER") || hypothesis.includes("SLEEP")) return "RECOVERY";
    }
    if (consecutiveMisses >= 3) return "RECOVERY";
    const energyScores = (Array.isArray(recentEnergy) ? recentEnergy : [])
      .map((item) => finiteNumber(item?.score ?? item?.value, NaN))
      .filter((value) => Number.isFinite(value));
    const sleepHours = (Array.isArray(recentSleep) ? recentSleep : [])
      .map((item) => finiteNumber(item?.hours ?? item?.value, NaN))
      .filter((value) => Number.isFinite(value));
    const averageEnergy =
      energyScores.reduce((sum, value) => sum + value, 0) / (energyScores.length || 1);
    const averageSleep =
      sleepHours.reduce((sum, value) => sum + value, 0) / (sleepHours.length || 1);
    if (energyScores.length && averageEnergy <= 2) return "ENERGY";
    if (sleepHours.length && averageSleep < 7) return "RECOVERY";
    if (consecutiveMisses >= 1) return "CONSISTENCY";
    return "FOCUS";
  }

  function calculateIdentityAdherence(history, goals, identityId, start, end) {
    const goalIds = new Set(
      (Array.isArray(goals) ? goals : [])
        .filter((goal) => normalizeGoalRecord(goal).identityId === identityId)
        .map((goal) => normalizeGoalRecord(goal).id),
    );
    const relevant = (Array.isArray(history) ? history : []).filter((entry) => {
      if (!wasPlannedOpportunity(entry)) return false;
      const belongs =
        goalIds.has(historyGoalId(entry)) || text(entry.identityId) === identityId;
      if (!belongs) return false;
      if (!start || !end) return true;
      return isWithinDateRange(historyDate(entry), start, end);
    });
    const completed = relevant.filter(wasCompleted).length;
    const planned = relevant.length;
    return {
      identityId,
      completed,
      planned,
      missed: planned - completed,
      rate: planned ? completed / planned : 0,
      percent: planned ? Math.round((completed / planned) * 100) : 0,
    };
  }

  function chooseLeadingIdentity(rows) {
    const list = (Array.isArray(rows) ? rows : []).filter(
      (row) => text(row?.identityId) && finiteNumber(row?.planned) > 0,
    );
    if (!list.length) return null;
    return [...list].sort(
      (left, right) =>
        finiteNumber(right.completed) - finiteNumber(left.completed) ||
        finiteNumber(right.percent) - finiteNumber(left.percent) ||
        text(left.identityId).localeCompare(text(right.identityId)),
    )[0];
  }

  function setGoalStatus(input, status, now = null) {
    const nowDate = parseDate(now) || new Date();
    const goal = normalizeGoalRecord(input, nowDate);
    const nextStatus = text(status).toLowerCase();
    return normalizeGoalRecord(
      {
        ...goal,
        status: GOAL_STATUSES.has(nextStatus) ? nextStatus : goal.status,
        timestamps: {
          ...goal.timestamps,
          updatedAt: nowDate.toISOString(),
        },
      },
      nowDate,
    );
  }

  function validateBehaviorRecord(input, now = null) {
    const source = isObject(input) ? input : {};
    const behavior = normalizeBehaviorRecord(input, {}, now);
    const errors = [];
    if (!isObject(input)) errors.push("Behavior must be an object.");
    if (behavior.version !== BEHAVIOR_VERSION) {
      errors.push(`Unsupported behavior version: ${behavior.version}.`);
    }
    if (!behavior.goalId) errors.push("goalId is required.");
    if (!behavior.title) errors.push("title is required.");
    if (source.frequency !== undefined && source.frequency !== "") {
      const frequency = Number(source.frequency);
      if (!Number.isFinite(frequency) || frequency < 1 || frequency > 7) {
        errors.push("frequency must be between 1 and 7 days per week.");
      }
    }
    if (text(source.difficulty) && !BEHAVIOR_DIFFICULTIES.has(text(source.difficulty).toLowerCase())) {
      errors.push("difficulty must be easy, medium, or hard.");
    }
    if (text(source.status) && !BEHAVIOR_STATUSES.has(text(source.status).toLowerCase())) {
      errors.push("status must be active, paused, or archived.");
    }
    if (!behavior.timestamps.createdAt || !behavior.timestamps.updatedAt) {
      errors.push("timestamps must be valid.");
    }
    return { valid: errors.length === 0, errors, value: behavior, behavior };
  }

  function missionsSupportingBehavior(missions, behaviorId) {
    const id = text(behaviorId);
    if (!id) return [];
    return (Array.isArray(missions) ? missions : []).filter(
      (mission) => text(mission?.behaviorId) === id,
    );
  }

  function calculateBehaviorEvidence(behaviorInput, history, date = new Date(), events = []) {
    const behavior = normalizeBehaviorRecord(behaviorInput, {}, date);
    const today = startOfDay(date);
    const weekStart = startOfWeek(today);
    const weekEnd = endOfDay(today);
    const entries = (Array.isArray(history) ? history : []).filter(
      (entry) => historyBehaviorId(entry) === behavior.id,
    );
    const weekEntries = entries.filter(
      (entry) =>
        wasPlannedOpportunity(entry) &&
        isWithinDateRange(historyDate(entry), weekStart, weekEnd),
    );
    const completed = weekEntries.filter(wasCompleted).length;
    const planned = weekEntries.length;
    const lastCompleted = entries
      .filter(wasCompleted)
      .map(historyDate)
      .filter((value) => parseDate(value))
      .sort((a, b) => calendarSerial(b) - calendarSerial(a))[0];
    const eventHits = (Array.isArray(events) ? events : []).filter((event) => {
      const type = text(event?.type);
      const metaId = text(event?.metadata?.behaviorId);
      return (
        type === "MISSION_COMPLETED" &&
        metaId === behavior.id &&
        isWithinDateRange(event.timestamp, weekStart, weekEnd)
      );
    }).length;
    const happening = completed > 0 || eventHits > 0;
    let fact = "No planned missions for this behavior this week.";
    if (planned) {
      fact = `${completed}/${planned} planned missions kept this week.`;
    } else if (eventHits) {
      fact = `${eventHits} completed ${eventHits === 1 ? "mission" : "missions"} this week.`;
    }
    return {
      behaviorId: behavior.id,
      goalId: behavior.goalId,
      planned,
      completed,
      missed: Math.max(0, planned - completed),
      percent: planned ? Math.round((completed / planned) * 100) : 0,
      lastCompletedAt: lastCompleted ? formatDateKey(lastCompleted) : "",
      happening,
      fact,
    };
  }

  function setBehaviorStatus(input, status, now = null) {
    const nowDate = parseDate(now) || new Date();
    const behavior = normalizeBehaviorRecord(input, {}, nowDate);
    const nextStatus = text(status).toLowerCase();
    return normalizeBehaviorRecord(
      {
        ...behavior,
        status: BEHAVIOR_STATUSES.has(nextStatus) ? nextStatus : behavior.status,
        timestamps: {
          ...behavior.timestamps,
          updatedAt: nowDate.toISOString(),
        },
      },
      {},
      nowDate,
    );
  }

  function applyBehaviorAdaptation(behaviors, proposal = {}) {
    const list = (Array.isArray(behaviors) ? behaviors : []).map((behavior) =>
      normalizeBehaviorRecord(behavior),
    );
    const changes = Array.isArray(proposal.changes) ? proposal.changes : [];
    return list.map((behavior) => {
      const change = changes.find((item) => text(item?.behaviorId) === behavior.id);
      if (!change) return behavior;
      const cue = isObject(change.cue) ? change.cue : {};
      const nextTitle =
        text(change.title) || text(change.standard) || behavior.title || behavior.standard;
      return normalizeBehaviorRecord({
        ...behavior,
        title: nextTitle,
        standard: nextTitle,
        description: text(change.description) || behavior.description,
        frequency: finiteNumber(change.frequency, behavior.frequency),
        difficulty: change.difficulty || behavior.difficulty,
        minimum: text(change.minimum) || behavior.minimum,
        cue: {
          ...behavior.cue,
          trigger: text(cue.trigger) || behavior.cue.trigger,
          time: text(cue.time) || behavior.cue.time,
          place: text(cue.place) || behavior.cue.place,
        },
        timestamps: {
          ...behavior.timestamps,
          updatedAt: new Date().toISOString(),
        },
      });
    });
  }

  const goalEngine = {
    GOAL_VERSION,
    BEHAVIOR_VERSION,
    IDENTITY_CATALOG,
    AREA_TO_IDENTITY,
    ACTIVE_STATUSES,
    PAUSED_STATUS,
    FINAL_STATUSES,
    GOAL_STATUSES,
    BEHAVIOR_STATUSES,
    BEHAVIOR_DIFFICULTIES,
    FOCUS_THEMES,
    DEFAULT_PRIVATE_CONFIG,
    identityFromArea,
    areaFromIdentity,
    categoryFromIdentity,
    identityFromCategory,
    goalTitle,
    normalizeObstacles,
    isPlannableGoal,
    isPlannableBehavior,
    behaviorTitle,
    normalizeGoalRecord,
    normalizeBehaviorRecord,
    extractBehaviorsFromGoal,
    migrateGoalCollection,
    validateGoalRecord,
    validateBehaviorRecord,
    calculateSMARTCompleteness,
    calculateSmartCompleteness: calculateSMARTCompleteness,
    calculateGoalReadiness,
    hasUsableMetric,
    parseDate,
    formatDateKey,
    startOfDay,
    endOfDay,
    addDays,
    differenceInCalendarDays,
    isWithinDateRange,
    getDateArc,
    startOfWeek,
    validatePrivateConfig,
    validatePersonalConfig,
    chooseActiveMilestones,
    chooseUpcomingMilestones,
    chooseMilestoneTasks,
    selectDailyMissions,
    calculateWeeklyConsistency,
    calculateFollowThrough,
    countConsecutiveMisses,
    deriveFocusTheme,
    calculateIdentityAdherence,
    chooseLeadingIdentity,
    applyBehaviorAdaptation,
    setGoalStatus,
    setBehaviorStatus,
    missionsSupportingBehavior,
    calculateBehaviorEvidence,
    buildLapseRecovery,
  };

  globalScope.LockInGoals = goalEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = goalEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
