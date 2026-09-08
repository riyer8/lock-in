(function initializeGoalEngine(globalScope) {
  "use strict";

  const GOAL_VERSION = 1;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ACTIVE_STATUSES = new Set(["active", "in-progress"]);
  const FINAL_STATUSES = new Set(["completed", "cancelled", "archived"]);

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

  function normalizeGoalRecord(input, now = null) {
    const source = isObject(input) ? input : {};
    const metric = isObject(source.metric) ? source.metric : {};
    const cue = isObject(source.cue) ? source.cue : {};
    const actions = isObject(source.actions) ? source.actions : {};
    const timestamps = isObject(source.timestamps) ? source.timestamps : {};
    const area = text(source.area);
    const outcome = text(source.outcome);
    const generatedId = `${area}-${outcome}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const nowDate =
      parseDate(now) ||
      parseDate(timestamps.updatedAt) ||
      parseDate(timestamps.createdAt) ||
      new Date(0);
    const nowIso = nowDate.toISOString();
    const deadline = formatDateKey(source.deadline);
    const status = text(source.status).toLowerCase() || "active";

    return {
      version: Number.isInteger(source.version) ? source.version : GOAL_VERSION,
      id: text(source.id) || `goal-${generatedId || "untitled"}`,
      area,
      outcome,
      why: text(source.why),
      metric: {
        baseline: finiteNumber(metric.baseline),
        target: finiteNumber(metric.target),
        current: finiteNumber(metric.current, finiteNumber(metric.baseline)),
        unit: text(metric.unit),
      },
      deadline,
      frequencyPerWeek: clamp(Math.round(finiteNumber(source.frequencyPerWeek)), 0, 7),
      cue: {
        trigger: text(cue.trigger),
        time: text(cue.time),
        place: text(cue.place),
      },
      actions: {
        minimum: text(actions.minimum),
        standard: text(actions.standard),
        stretch: text(actions.stretch),
      },
      obstacle: text(source.obstacle),
      recoveryPlan: text(source.recoveryPlan),
      reward: text(source.reward),
      status: status || "active",
      timestamps: {
        createdAt: parseDate(timestamps.createdAt)?.toISOString() || nowIso,
        updatedAt: parseDate(timestamps.updatedAt)?.toISOString() || nowIso,
      },
    };
  }

  function validateGoalRecord(input, now = null) {
    const goal = normalizeGoalRecord(input, now);
    const errors = [];
    if (!isObject(input)) errors.push("Goal must be an object.");
    if (goal.version !== GOAL_VERSION) errors.push(`Unsupported goal version: ${goal.version}.`);
    if (!goal.area) errors.push("area is required.");
    if (!goal.outcome) errors.push("outcome is required.");
    if (!goal.why) errors.push("why is required.");
    if (!goal.metric.unit) errors.push("metric.unit is required.");
    if (goal.metric.target === goal.metric.baseline) {
      errors.push("metric.target must differ from metric.baseline.");
    }
    if (!goal.deadline) errors.push("deadline must be a valid date.");
    if (goal.frequencyPerWeek < 1) errors.push("frequencyPerWeek must be between 1 and 7.");
    if (!goal.actions.minimum || !goal.actions.standard) {
      errors.push("minimum and standard actions are required.");
    }
    if (!goal.cue.trigger || !goal.cue.place) {
      errors.push("cue trigger and place are required.");
    }
    if (!goal.obstacle || !goal.recoveryPlan) {
      errors.push("obstacle and recoveryPlan are required.");
    }
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
        config: { schemaVersion: 1, arc: null, milestones: [], attentionDomains: [] },
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
      ? { schemaVersion: 1, arc: null, milestones: [], attentionDomains: [] }
      : {
          schemaVersion: 1,
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

  function selectDailyMissions(goals, history, milestones, date, limit = 3) {
    const today = startOfDay(date);
    if (!today) return [];
    const safeHistory = Array.isArray(history) ? history : [];
    const safeMilestones = Array.isArray(milestones) ? milestones : [];
    const weekStart = startOfWeek(today);
    const normalizedGoals = (Array.isArray(goals) ? goals : []).map((input, index) => ({
      goal: normalizeGoalRecord(input, today),
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

    const candidates = normalizedGoals
      .filter(({ goal }) => ACTIVE_STATUSES.has(goal.status) && goal.deadline)
      .map(({ goal, index }) => {
        const goalHistory = safeHistory.filter((entry) => historyGoalId(entry) === goal.id);
        const weekCompletions = goalHistory.filter(
          (entry) =>
            wasCompleted(entry) &&
            isWithinDateRange(historyDate(entry), weekStart, endOfDay(today)),
        ).length;
        const mostRecent = goalHistory
          .filter(wasCompleted)
          .map(historyDate)
          .filter((value) => parseDate(value))
          .sort((a, b) => calendarSerial(b) - calendarSerial(a))[0];
        const neglectedDays = mostRecent
          ? Math.max(0, differenceInCalendarDays(today, mostRecent))
          : 7;
        const daysToDeadline = differenceInCalendarDays(goal.deadline, today);
        const urgency =
          daysToDeadline < 0
            ? 1 + Math.min(Math.abs(daysToDeadline), 30) / 30
            : 1 / (daysToDeadline + 1);
        const frequencyDeficit = Math.max(0, goal.frequencyPerWeek - weekCompletions);
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
        const rotationScore = 1 / ((recentAreas.get(goal.area) || 0) + 1);
        const score =
          DEFAULT_PRIVATE_CONFIG.weights.urgency * urgency +
          DEFAULT_PRIVATE_CONFIG.weights.frequency * frequencyDeficit +
          DEFAULT_PRIVATE_CONFIG.weights.neglect * (Math.min(neglectedDays, 14) / 14) +
          DEFAULT_PRIVATE_CONFIG.weights.milestone * milestoneScore +
          DEFAULT_PRIVATE_CONFIG.weights.rotation * rotationScore;
        return {
          id: `${formatDateKey(today)}:${goal.id}`,
          goalId: goal.id,
          area: goal.area,
          outcome: goal.outcome,
          action: goal.actions.standard || goal.actions.minimum,
          minimumAction: goal.actions.minimum,
          score,
          daysToDeadline,
          frequencyRemaining: frequencyDeficit,
          milestoneTasks: relatedTasks,
          index,
        };
      });

    return candidates
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.daysToDeadline - b.daysToDeadline ||
          a.goalId.localeCompare(b.goalId) ||
          a.index - b.index,
      )
      .slice(0, clamp(Math.floor(finiteNumber(limit, 3)), 0, 3))
      .map(({ index, ...mission }) => mission);
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

  const goalEngine = {
    GOAL_VERSION,
    DEFAULT_PRIVATE_CONFIG,
    normalizeGoalRecord,
    validateGoalRecord,
    calculateSMARTCompleteness,
    calculateSmartCompleteness: calculateSMARTCompleteness,
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
    buildLapseRecovery,
  };

  globalScope.LockInGoals = goalEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = goalEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
