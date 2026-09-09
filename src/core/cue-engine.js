(function initializeCueEngine(globalScope) {
  "use strict";

  const CUE_VERSION = 1;
  const CUES_STORAGE_KEY = "lock-in-cues-v1";
  const CUE_STATE_STORAGE_KEY = "lock-in-cue-state-v1";
  const DEFAULT_INTERVAL_MINUTES = 60;
  const MIN_INTERVAL_MINUTES = 5;
  const MAX_INTERVAL_MINUTES = 240;
  const QUIET_START_HOUR = 23;
  const QUIET_END_HOUR = 7;
  const DEFAULT_CUES = Object.freeze([
    Object.freeze({
      id: "water",
      title: "Drink water",
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      enabled: true,
    }),
    Object.freeze({
      id: "walk",
      title: "Stand and walk",
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      enabled: true,
    }),
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

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function parseDate(value) {
    if (value instanceof Date) {
      const copy = new Date(value.getTime());
      return Number.isNaN(copy.getTime()) ? null : copy;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function cueTitle(source) {
    return text(source?.title);
  }

  function normalizeCue(input, now = null) {
    const source = isObject(input) ? input : {};
    const nowDate = parseDate(now) || new Date(0);
    const title = cueTitle(source);
    const generatedId = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const intervalMinutes = clamp(
      Math.round(finiteNumber(source.intervalMinutes, DEFAULT_INTERVAL_MINUTES)),
      MIN_INTERVAL_MINUTES,
      MAX_INTERVAL_MINUTES,
    );
    return {
      version: CUE_VERSION,
      id: text(source.id) || `cue-${generatedId || nowDate.getTime()}`,
      title,
      intervalMinutes,
      enabled: source.enabled !== false,
    };
  }

  function normalizeCueCollection(input) {
    if (input == null) {
      return DEFAULT_CUES.map((cue) => normalizeCue(cue));
    }
    const listed = Array.isArray(input) ? input.map((item) => normalizeCue(item)) : [];
    const seen = new Set();
    return listed.filter((cue) => {
      if (!cue.title || seen.has(cue.id)) return false;
      seen.add(cue.id);
      return true;
    });
  }

  function normalizeState(input) {
    const source = isObject(input) ? input : {};
    const lastById = {};
    const raw = isObject(source.lastById) ? source.lastById : {};
    Object.entries(raw).forEach(([id, entry]) => {
      if (!text(id) || !isObject(entry)) return;
      lastById[id] = {
        lastShownAt: parseDate(entry.lastShownAt)?.toISOString() || "",
        lastDoneAt: parseDate(entry.lastDoneAt)?.toISOString() || "",
      };
    });
    return {
      pendingId: text(source.pendingId),
      initializedAt: parseDate(source.initializedAt)?.toISOString() || "",
      lastById,
    };
  }

  function ensureInitialized(state, now = new Date()) {
    const snapshot = normalizeState(state);
    if (snapshot.initializedAt) return snapshot;
    const current = parseDate(now) || new Date();
    return { ...snapshot, initializedAt: current.toISOString() };
  }

  function isQuietHour(date = new Date()) {
    const current = parseDate(date);
    if (!current) return false;
    const hour = current.getHours();
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  }

  function minutesSince(iso, now) {
    const then = parseDate(iso);
    const current = parseDate(now);
    if (!then || !current) return Number.POSITIVE_INFINITY;
    return (current.getTime() - then.getTime()) / 60000;
  }

  function isDue(cue, state, now = new Date()) {
    const record = normalizeCue(cue);
    if (!record.enabled || !record.title) return false;
    const snapshot = normalizeState(state);
    const last = snapshot.lastById[record.id];
    const anchor = last?.lastShownAt || snapshot.initializedAt;
    if (!anchor) return false;
    return minutesSince(anchor, now) >= record.intervalMinutes;
  }

  function chooseDueCue(cues, state, now = new Date()) {
    if (isQuietHour(now)) return null;
    const list = normalizeCueCollection(cues);
    const snapshot = normalizeState(state);
    if (snapshot.pendingId) {
      const pending = list.find((cue) => cue.id === snapshot.pendingId && cue.enabled);
      if (pending) return pending;
    }
    return (
      list.find((cue) => isDue(cue, snapshot, now)) || null
    );
  }

  function stampOrKeep(flag, previous, current) {
    if (flag === undefined) return previous;
    if (flag === true) return current.toISOString();
    return parseDate(flag)?.toISOString() || current.toISOString();
  }

  function touchCue(state, cueId, now, extra = {}) {
    const snapshot = normalizeState(state);
    const current = parseDate(now) || new Date();
    const previous = snapshot.lastById[cueId] || { lastShownAt: "", lastDoneAt: "" };
    return {
      pendingId: extra.pendingId === undefined ? snapshot.pendingId : extra.pendingId,
      initializedAt: snapshot.initializedAt,
      lastById: {
        ...snapshot.lastById,
        [cueId]: {
          lastShownAt: stampOrKeep(extra.lastShownAt, previous.lastShownAt, current),
          lastDoneAt: stampOrKeep(extra.lastDoneAt, previous.lastDoneAt, current),
        },
      },
    };
  }

  function markPending(state, cueId) {
    return { ...normalizeState(state), pendingId: text(cueId) };
  }

  function markShown(state, cueId, now = new Date()) {
    return touchCue(state, cueId, now, { lastShownAt: true, pendingId: text(cueId) });
  }

  function markDone(state, cueId, now = new Date()) {
    return touchCue(state, cueId, now, {
      lastShownAt: true,
      lastDoneAt: true,
      pendingId: "",
    });
  }

  function markSnoozed(state, cueId, now = new Date()) {
    return touchCue(state, cueId, now, { lastShownAt: true, pendingId: "" });
  }

  const cueEngine = {
    CUE_VERSION,
    CUES_STORAGE_KEY,
    CUE_STATE_STORAGE_KEY,
    DEFAULT_CUES,
    DEFAULT_INTERVAL_MINUTES,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    QUIET_START_HOUR,
    QUIET_END_HOUR,
    normalizeCue,
    normalizeCueCollection,
    normalizeState,
    ensureInitialized,
    isQuietHour,
    isDue,
    chooseDueCue,
    markPending,
    markShown,
    markDone,
    markSnoozed,
  };

  globalScope.LockInCues = cueEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = cueEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
