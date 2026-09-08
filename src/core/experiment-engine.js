(function initializeExperimentEngine(globalScope) {
  "use strict";

  const EXPERIMENT_VERSION = 1;
  const STATUSES = new Set([
    "proposed",
    "active",
    "completed",
    "kept",
    "discarded",
  ]);

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

  function formatDateKey(value) {
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

  function normalizeProtocolItem(input, index = 0) {
    const source = isObject(input) ? input : {};
    return {
      id: text(source.id) || `protocol-${index}`,
      title: text(source.title) || text(source.behaviorChange),
      behaviorChange: text(source.behaviorChange) || text(source.title),
      measureKey: text(source.measureKey) || "completion",
      when: text(source.when) || "daily",
      behaviorId: text(source.behaviorId),
    };
  }

  function normalizeExperiment(input, now = null) {
    const source = isObject(input) ? input : {};
    const status = text(source.status).toLowerCase() || "proposed";
    const protocol = (Array.isArray(source.protocol) ? source.protocol : []).map(
      (item, index) => normalizeProtocolItem(item, index),
    );
    const result = isObject(source.result) ? source.result : null;
    return {
      version: EXPERIMENT_VERSION,
      id: text(source.id) || `experiment-${Date.now()}`,
      hypothesis: text(source.hypothesis),
      startDate: formatDateKey(source.startDate),
      endDate: formatDateKey(source.endDate),
      protocol,
      status: STATUSES.has(status) ? status : "proposed",
      result: result
        ? {
            adherence: finiteNumber(result.adherence),
            measures: isObject(result.measures) ? { ...result.measures } : {},
            completedDays: Math.round(finiteNumber(result.completedDays)),
            plannedDays: Math.round(finiteNumber(result.plannedDays)),
          }
        : null,
      conclusion: text(source.conclusion),
      timestamps: {
        createdAt:
          source.timestamps?.createdAt ||
          (now ? new Date(now).toISOString() : new Date(0).toISOString()),
        updatedAt:
          source.timestamps?.updatedAt ||
          (now ? new Date(now).toISOString() : new Date(0).toISOString()),
      },
    };
  }

  function validateExperiment(input, now = null) {
    const experiment = normalizeExperiment(input, now);
    const errors = [];
    if (!experiment.hypothesis) errors.push("hypothesis is required.");
    if (!experiment.startDate || !experiment.endDate) {
      errors.push("startDate and endDate are required.");
    }
    if (!experiment.protocol.length) errors.push("protocol needs at least one item.");
    return { valid: errors.length === 0, errors, value: experiment };
  }

  function isActiveOn(experiment, date) {
    const key = formatDateKey(date);
    const record = normalizeExperiment(experiment);
    if (record.status !== "active") return false;
    if (!key || !record.startDate || !record.endDate) return false;
    return key >= record.startDate && key <= record.endDate;
  }

  function protocolActionsForDate(experiments, date) {
    return (Array.isArray(experiments) ? experiments : [])
      .filter((experiment) => isActiveOn(experiment, date))
      .flatMap((experiment) => {
        const record = normalizeExperiment(experiment);
        return record.protocol.map((item) => ({
          id: `${formatDateKey(date)}:experiment:${record.id}:${item.id}`,
          experimentId: record.id,
          behaviorId: item.behaviorId || null,
          title: item.title || item.behaviorChange,
          description: item.behaviorChange,
          source: "experiment",
          measureKey: item.measureKey,
          when: item.when,
        }));
      });
  }

  function summarizeMeasures(measures, key) {
    const values = (Array.isArray(measures) ? measures : [])
      .filter((item) => text(item?.key) === key)
      .map((item) => finiteNumber(item.value, NaN))
      .filter((value) => Number.isFinite(value));
    if (!values.length) return { count: 0, average: 0 };
    return {
      count: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
    };
  }

  function evaluateExperiment(experiment, history, measures, now = null) {
    const record = normalizeExperiment(experiment, now);
    const start = record.startDate;
    const end = record.endDate;
    const relevant = (Array.isArray(history) ? history : []).filter((entry) => {
      const date = formatDateKey(entry?.date ?? entry?.timestamp);
      return (
        date &&
        date >= start &&
        date <= end &&
        (entry?.experimentId === record.id ||
          record.protocol.some((item) => item.behaviorId && item.behaviorId === entry?.behaviorId))
      );
    });
    const planned = relevant.filter((entry) => entry?.planned !== false).length || relevant.length;
    const completed = relevant.filter(
      (entry) => entry?.completed === true || text(entry?.status).toLowerCase() === "completed",
    ).length;
    const adherence = planned ? completed / planned : 0;
    const measureSummary = {};
    record.protocol.forEach((item) => {
      if (item.measureKey && item.measureKey !== "completion") {
        measureSummary[item.measureKey] = summarizeMeasures(measures, item.measureKey);
      }
    });
    const keptLikely = adherence >= 0.7;
    return {
      ...record,
      status: "completed",
      result: {
        adherence,
        completedDays: completed,
        plannedDays: planned || Math.max(completed, 1),
        measures: measureSummary,
      },
      conclusion: keptLikely
        ? "This protocol appears to work better for you."
        : "This protocol did not stick clearly enough to keep automatically.",
    };
  }

  const experimentEngine = {
    EXPERIMENT_VERSION,
    STATUSES,
    normalizeExperiment,
    validateExperiment,
    isActiveOn,
    protocolActionsForDate,
    evaluateExperiment,
    summarizeMeasures,
  };

  globalScope.LockInExperiments = experimentEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = experimentEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
