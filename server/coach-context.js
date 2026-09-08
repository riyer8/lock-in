"use strict";

const MAX_GOALS = 10;
const MAX_RECENT_AUDITS = 6;
const MAX_RECENT_EVENTS = 100;
const MAX_CURRENT_MISSIONS = 5;
const MAX_RECENT_MISSION_OUTCOMES = 35;
const MAX_INTERVENTION_OUTCOMES = 20;

class ContextError extends Error {
  constructor(message, statusCode = 400, code = "MALFORMED_REQUEST") {
    super(message);
    this.name = "ContextError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireArray(value, name, maximum) {
  if (!Array.isArray(value)) {
    throw new ContextError(`${name} must be an array.`);
  }
  if (value.length > maximum) {
    throw new ContextError(`${name} contains too many items.`, 413, "CONTEXT_TOO_LARGE");
  }
  return value;
}

function buildCoachContext(value) {
  if (!isPlainObject(value)) {
    throw new ContextError("Request body must be a JSON object.");
  }

  const blueprint = value.blueprint;
  const todayAudit = value.todayAudit;
  if (!isPlainObject(blueprint) || !isPlainObject(todayAudit)) {
    throw new ContextError("blueprint and todayAudit must be objects.");
  }

  const context = {
    schemaVersion: 2,
    asOf: typeof value.asOf === "string" ? value.asOf : "",
    blueprint,
    goals: requireArray(value.goals, "goals", MAX_GOALS),
    todayAudit,
    recentAudits: requireArray(
      value.recentAudits,
      "recentAudits",
      MAX_RECENT_AUDITS,
    ),
    recentEvents: requireArray(
      value.recentEvents,
      "recentEvents",
      MAX_RECENT_EVENTS,
    ),
    currentMissions: requireArray(
      value.currentMissions,
      "currentMissions",
      MAX_CURRENT_MISSIONS,
    ),
    recentMissionOutcomes: requireArray(
      value.recentMissionOutcomes ?? [],
      "recentMissionOutcomes",
      MAX_RECENT_MISSION_OUTCOMES,
    ),
    interventionOutcomes: requireArray(
      value.interventionOutcomes,
      "interventionOutcomes",
      MAX_INTERVENTION_OUTCOMES,
    ),
  };

  const hasContext =
    Object.keys(blueprint).length > 0 ||
    context.goals.length > 0 ||
    Object.keys(todayAudit).length > 0 ||
    context.recentAudits.length > 0 ||
    context.recentEvents.length > 0 ||
    context.currentMissions.length > 0 ||
    context.recentMissionOutcomes.length > 0 ||
    context.interventionOutcomes.length > 0;

  if (!hasContext) {
    throw new ContextError(
      "Add blueprint, audit, event, mission, or intervention context.",
      400,
      "EMPTY_CONTEXT",
    );
  }

  return context;
}

module.exports = {
  ContextError,
  buildCoachContext,
};
