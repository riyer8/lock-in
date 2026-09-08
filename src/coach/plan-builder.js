(function initializePlanBuilder(globalScope) {
  "use strict";

  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeLabel(value) {
    return text(value)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function slug(value) {
    return normalizeLabel(value).replace(/\s+/g, "-").slice(0, 48) || "mission";
  }

  function formatDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = String(date.getFullYear()).padStart(4, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function choosePlanDifficulty(recentOutcomes = []) {
    const planned = (Array.isArray(recentOutcomes) ? recentOutcomes : []).filter(
      (item) => item?.planned !== false,
    );
    const completed = planned.filter((item) => item?.completed).length;
    const rate = planned.length ? completed / planned.length : 0.5;
    if (rate < 0.4) return "minimum";
    if (rate >= 0.8) return "stretch";
    return "standard";
  }

  function planSize(difficulty) {
    if (difficulty === "minimum") return 3;
    if (difficulty === "stretch") return 5;
    return 4;
  }

  function actionForDifficulty(goal, difficulty) {
    const actions =
      goal?.actions && typeof goal.actions === "object" ? goal.actions : {};
    return (
      text(actions[difficulty]) ||
      text(actions.standard) ||
      text(actions.minimum) ||
      text(actions.stretch)
    );
  }

  function findMatchingGoal(mission, goals, usedGoalIds, areaLabels) {
    const category = normalizeLabel(mission.category);
    const title = normalizeLabel(mission.title);
    const available = (Array.isArray(goals) ? goals : []).filter(
      (goal) => goal?.id && !usedGoalIds.has(goal.id),
    );
    return (
      available.find((goal) => normalizeLabel(goal.outcome) === title) ||
      available.find((goal) => {
        const area = normalizeLabel(goal.area);
        const label = normalizeLabel(areaLabels[goal.area] || goal.areaLabel);
        return Boolean(category) && (category === area || category === label);
      }) ||
      available.find((goal) => {
        const outcome = normalizeLabel(goal.outcome);
        return (
          Boolean(title) &&
          Boolean(outcome) &&
          (outcome.includes(title) || title.includes(outcome))
        );
      }) ||
      null
    );
  }

  function chooseDescription(mission, goal, difficulty) {
    const title = text(mission.title);
    if (!goal) return title;
    const outcome = text(goal.outcome);
    if (title && normalizeLabel(title) !== normalizeLabel(outcome)) {
      return title;
    }
    return actionForDifficulty(goal, difficulty) || title;
  }

  function toMission(mission, goal, dateKey, difficulty, areaLabels) {
    const cue = goal?.cue && typeof goal.cue === "object" ? goal.cue : {};
    const category =
      (goal && (areaLabels[goal.area] || goal.area)) || text(mission.category);
    const result = {
      id: goal
        ? `${dateKey}:${goal.id}`
        : `${dateKey}:plan:${slug(mission.title)}`,
      area: goal?.area || slug(mission.category),
      category,
      title: text(goal?.outcome) || text(mission.title),
      description: chooseDescription(mission, goal, difficulty),
      target:
        text(cue.trigger) && text(cue.place)
          ? `When ${text(cue.trigger)} · ${text(cue.place)}`
          : "Today",
      priority: mission.priority,
      reason: text(mission.reason),
      source: "adaptive-plan",
    };
    if (goal?.id) result.goalId = goal.id;
    if (text(goal?.actions?.minimum)) {
      result.minimumAction = text(goal.actions.minimum);
    }
    if (text(goal?.actions?.standard)) {
      result.standardAction = text(goal.actions.standard);
    }
    if (text(goal?.actions?.stretch)) {
      result.stretchAction = text(goal.actions.stretch);
    }
    return result;
  }

  function sameMission(left, right) {
    if (left.id && right.id && left.id === right.id) return true;
    if (left.goalId && right.goalId && left.goalId === right.goalId) return true;
    if (
      left.milestoneTaskId &&
      right.milestoneTaskId &&
      left.milestoneTaskId === right.milestoneTaskId
    ) {
      return true;
    }
    return normalizeLabel(left.title) === normalizeLabel(right.title);
  }

  function buildAdaptiveMissions({
    proposed = [],
    goals = [],
    date = new Date(),
    recentOutcomes = [],
    preserved = [],
    areaLabels = {},
  } = {}) {
    const difficulty = choosePlanDifficulty(recentOutcomes);
    const limit = Math.min(5, Math.max(3, planSize(difficulty)));
    const todayKey = formatDateKey(date);
    const kept = (Array.isArray(preserved) ? preserved : [])
      .filter((mission) => mission && text(mission.title))
      .slice(0, limit)
      .map((mission) => ({
        ...mission,
        reason:
          text(mission.reason) ||
          "Kept because it is already an important commitment today.",
        source: mission.source || "adaptive-plan",
      }));
    const usedGoalIds = new Set(
      kept.map((mission) => mission.goalId).filter(Boolean),
    );
    const ranked = [...(Array.isArray(proposed) ? proposed : [])].sort(
      (first, second) =>
        (PRIORITY_RANK[first?.priority] ?? 9) -
        (PRIORITY_RANK[second?.priority] ?? 9),
    );
    const generated = [];

    ranked.forEach((item) => {
      if (generated.length + kept.length >= limit) return;
      const title = text(item?.title);
      if (!title) return;
      const matchedGoal = findMatchingGoal(
        item,
        goals,
        usedGoalIds,
        areaLabels,
      );
      let mission = toMission(
        item,
        matchedGoal,
        todayKey,
        difficulty,
        areaLabels,
      );
      const duplicates = [...kept, ...generated];
      if (duplicates.some((existing) => sameMission(existing, mission))) {
        if (!matchedGoal) return;
        mission = toMission(item, null, todayKey, difficulty, areaLabels);
        if (duplicates.some((existing) => sameMission(existing, mission))) {
          return;
        }
      } else if (matchedGoal?.id) {
        usedGoalIds.add(matchedGoal.id);
      }
      generated.push(mission);
    });

    return [...kept, ...generated].slice(0, Math.max(kept.length, limit));
  }

  function applyAdaptationToPlan({
    proposed = [],
    goals = [],
    date = new Date(),
    recentOutcomes = [],
    preserved = [],
    areaLabels = {},
    proposal = null,
  } = {}) {
    const reason = text(proposal?.changes) || text(proposal?.reason);
    const adapted = (Array.isArray(proposed) ? proposed : []).map((mission) => ({
      ...mission,
      reason: reason
        ? `${text(mission.reason)} ${reason}`.trim()
        : text(mission.reason),
    }));
    const missions = buildAdaptiveMissions({
      proposed: adapted.length ? adapted : proposed,
      goals,
      date,
      recentOutcomes,
      preserved,
      areaLabels,
    });
    return missions.map((mission) => ({
      ...mission,
      source: "adapted-plan",
      adaptedFrom: text(proposal?.type) || "coach",
    }));
  }

  const planBuilder = {
    PRIORITY_RANK,
    buildAdaptiveMissions,
    applyAdaptationToPlan,
    choosePlanDifficulty,
    planSize,
  };

  globalScope.LockInPlanBuilder = planBuilder;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = planBuilder;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
