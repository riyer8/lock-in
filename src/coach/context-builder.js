(function initializeCoachContext(globalScope) {
  "use strict";

  const RECENT_WINDOW_DAYS = 7;
  const MAX_CURRENT_MISSIONS = 5;
  const MAX_RECENT_MISSION_OUTCOMES = 35;
  const MAX_CHAT_MESSAGES = 12;
  const MAX_CHAT_MESSAGE_CHARS = 400;
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
    "BEHAVIOR_CREATED",
    "BEHAVIOR_UPDATED",
    "BEHAVIOR_PAUSED",
    "BEHAVIOR_ARCHIVED",
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

  function summarizeMessage(message) {
    const role = message?.role === "coach" ? "coach" : message?.role === "user" ? "user" : "";
    const text = typeof message?.text === "string" ? message.text.trim() : "";
    if (!role || !text) return null;
    return {
      role,
      text: text.slice(0, MAX_CHAT_MESSAGE_CHARS),
      asOf: typeof message?.asOf === "string" ? message.asOf : "",
    };
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
    messages = [],
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
      messages: (Array.isArray(messages) ? messages : [])
        .map(summarizeMessage)
        .filter(Boolean)
        .slice(-MAX_CHAT_MESSAGES),
    };
  }

  const contextBuilder = {
    IMPORTANT_EVENT_TYPES,
    MAX_CHAT_MESSAGES,
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
