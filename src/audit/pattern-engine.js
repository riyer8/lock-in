(function initializePatternEngine(globalScope) {
  "use strict";

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function dateKey(value) {
    const goals = globalScope.LockInGoals;
    if (goals?.formatDateKey) return goals.formatDateKey(value);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function hourOf(timestamp) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date.getHours();
  }

  function detectMultiDayPatterns({
    history = [],
    events = [],
    goals = [],
    asOf = new Date(),
  } = {}) {
    const patterns = [];
    const todayKey = dateKey(asOf);
    const recentHistory = (Array.isArray(history) ? history : []).filter((entry) => {
      const key = dateKey(entry?.date ?? entry?.timestamp);
      return key && todayKey && key <= todayKey;
    });

    const byGoal = new Map();
    recentHistory.forEach((entry) => {
      const goalId = text(entry.goalId);
      if (!goalId || entry?.planned === false) return;
      const list = byGoal.get(goalId) || [];
      list.push(entry);
      byGoal.set(goalId, list);
    });

    const engine = globalScope.LockInGoals;
    byGoal.forEach((entries, goalId) => {
      const goal = (Array.isArray(goals) ? goals : []).find((item) => item.id === goalId);
      const misses = engine?.countConsecutiveMisses
        ? engine.countConsecutiveMisses(entries, goalId, asOf)
        : 0;
      if (misses >= 3) {
        patterns.push({
          id: `plan-unrealistic:${goalId}`,
          type: "PLAN_UNREALISTIC",
          severity: "attention",
          goalId,
          identityId: goal?.identityId || null,
          missedCount: misses,
          copy: "Was the plan unrealistic?",
        });
      }
    });

    const browserByDay = new Map();
    (Array.isArray(events) ? events : []).forEach((event) => {
      if (event?.type !== "BROWSER_SITE_SESSION") return;
      const key = dateKey(event.timestamp);
      if (!key) return;
      const list = browserByDay.get(key) || [];
      list.push(event);
      browserByDay.set(key, list);
    });

    const lateWorkDays = [];
    browserByDay.forEach((dayEvents, key) => {
      const last = [...dayEvents].sort(
        (first, second) => new Date(first.timestamp) - new Date(second.timestamp),
      ).at(-1);
      const hour = hourOf(last?.metadata?.endTime || last?.timestamp);
      const duration = Number(last?.metadata?.durationMs) || 0;
      if (hour !== null && hour >= 18 && duration > 20 * 60 * 1000) {
        lateWorkDays.push(key);
      }
    });

    const thinkerMissesOnLateDays = recentHistory.filter((entry) => {
      const key = dateKey(entry.date);
      if (!lateWorkDays.includes(key)) return false;
      if (entry.completed === true) return false;
      const goal = (Array.isArray(goals) ? goals : []).find((item) => item.id === entry.goalId);
      return goal?.identityId === "thinker" || /mind|career|learn|ml|deep/i.test(String(entry.area || entry.title || ""));
    });

    if (thinkerMissesOnLateDays.length >= 2 && lateWorkDays.length >= 2) {
      patterns.push({
        id: "deep-work-after-late-workdays",
        type: "DEEP_WORK_AFTER_LATE_DAYS",
        severity: "info",
        missedCount: thinkerMissesOnLateDays.length,
        copy: "Deep-work completion has dropped on days when the workday ran late.",
      });
    }

    if (!patterns.length) {
      patterns.push({
        id: "insufficient-pattern-data",
        type: "INSUFFICIENT_PATTERN_DATA",
        severity: "info",
        copy: "Not enough days to say.",
      });
    }

    return patterns;
  }

  const patternEngine = {
    detectMultiDayPatterns,
  };

  globalScope.LockInPatterns = patternEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = patternEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
