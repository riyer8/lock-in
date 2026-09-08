(function initializeCoachContext(globalScope) {
  "use strict";

  const RECENT_WINDOW_DAYS = 7;
  const MAX_CURRENT_MISSIONS = 5;
  const MAX_RECENT_MISSION_OUTCOMES = 35;
  const IMPORTANT_EVENT_TYPES = new Set([
    "MISSION_COMPLETED",
    "MISSION_UNCOMPLETED",
    "MOOD_SELECTED",
    "GOAL_CREATED",
    "GOAL_UPDATED",
    "GOAL_PROGRESS_UPDATED",
    "MILESTONE_TASK_COMPLETED",
    "WEEKLY_REVIEW_COMPLETED",
    "FITNESS_CHECKIN",
    "SLEEP_CHECKIN",
    "ENERGY_CHECKIN",
    "EXPERIMENT_MEASURE",
    "PLAN_ADAPTED",
  ]);

  function eventTime(event) {
    const time = new Date(event?.timestamp).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function summarizeEvent(event) {
    return {
      type: event.type,
      timestamp: event.timestamp,
      metadata: event.metadata ?? {},
    };
  }

  function isInterventionOutcome(event) {
    return (
      /^INTERVENTION_.*(OUTCOME|ACCEPTED|DISMISSED|COMPLETED)$/.test(
        String(event?.type ?? ""),
      ) || event?.metadata?.interventionOutcome !== undefined
    );
  }

  function buildCoachContext({
    asOf = new Date().toISOString(),
    blueprint = {},
    goals = [],
    todayAudit = {},
    recentAudits = [],
    recentEvents = [],
    currentMissions = [],
    recentMissionOutcomes = [],
    experiments = [],
    patterns = [],
    lastInsight = null,
    activeExperiment = null,
  } = {}) {
    const sortedEvents = [...recentEvents].sort(
      (first, second) => eventTime(second) - eventTime(first),
    );
    const importantEvents = sortedEvents
      .filter(
        (event) =>
          IMPORTANT_EVENT_TYPES.has(event?.type) || isInterventionOutcome(event),
      )
      .slice(0, 100)
      .map(summarizeEvent);
    const interventionOutcomes = sortedEvents
      .filter(isInterventionOutcome)
      .slice(0, 20)
      .map(summarizeEvent);

    return {
      schemaVersion: 2,
      asOf,
      blueprint,
      goals: goals.slice(0, 10),
      todayAudit,
      recentAudits: recentAudits.slice(0, RECENT_WINDOW_DAYS - 1),
      recentEvents: importantEvents,
      currentMissions: currentMissions.slice(0, MAX_CURRENT_MISSIONS),
      recentMissionOutcomes: recentMissionOutcomes.slice(
        0,
        MAX_RECENT_MISSION_OUTCOMES,
      ),
      interventionOutcomes,
      experiments: (Array.isArray(experiments) ? experiments : []).slice(0, 10),
      patterns: (Array.isArray(patterns) ? patterns : []).slice(0, 10),
      lastInsight: lastInsight && typeof lastInsight === "object" ? lastInsight : null,
      activeExperiment:
        activeExperiment && typeof activeExperiment === "object"
          ? activeExperiment
          : null,
    };
  }

  const contextBuilder = {
    IMPORTANT_EVENT_TYPES,
    MAX_CURRENT_MISSIONS,
    MAX_RECENT_MISSION_OUTCOMES,
    RECENT_WINDOW_DAYS,
    buildCoachContext,
    isInterventionOutcome,
  };

  globalScope.LockInCoachContext = contextBuilder;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = contextBuilder;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
