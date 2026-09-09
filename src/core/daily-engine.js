(function initializeDailyEngine(globalScope) {
  "use strict";

  const DAILY_VERSION = 1;
  const DAILIES_STORAGE_KEY = "lock-in-dailies-v1";
  const DAILY_COMPLETIONS_STORAGE_NAME = "daily-repeats";
  const MAX_DAILIES = 8;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeDaily(input, now = null) {
    const source = isObject(input) ? input : {};
    const title = text(source.title);
    const stamp = now instanceof Date ? now.getTime() : Date.now();
    const generatedId = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return {
      version: DAILY_VERSION,
      id: text(source.id) || `daily-${generatedId || stamp}`,
      title,
      enabled: source.enabled !== false,
    };
  }

  function normalizeDailyCollection(input) {
    const listed = Array.isArray(input) ? input.map((item) => normalizeDaily(item)) : [];
    const seen = new Set();
    return listed
      .filter((daily) => {
        if (!daily.title || seen.has(daily.id)) return false;
        seen.add(daily.id);
        return true;
      })
      .slice(0, MAX_DAILIES);
  }

  function completionIds(input) {
    const listed = Array.isArray(input) ? input : [];
    const seen = new Set();
    return listed
      .map((value) => text(value))
      .filter((id) => {
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
  }

  function withTodayState(dailies, completedInput) {
    const done = new Set(completionIds(completedInput));
    return normalizeDailyCollection(dailies)
      .filter((daily) => daily.enabled)
      .map((daily) => ({
        ...daily,
        completedToday: done.has(daily.id),
      }));
  }

  const dailyEngine = {
    DAILY_VERSION,
    DAILIES_STORAGE_KEY,
    DAILY_COMPLETIONS_STORAGE_NAME,
    MAX_DAILIES,
    normalizeDaily,
    normalizeDailyCollection,
    completionIds,
    withTodayState,
  };

  globalScope.LockInDailies = dailyEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = dailyEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
