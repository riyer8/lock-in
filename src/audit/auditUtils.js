(function initializeAuditUtils(globalScope) {
  const MINUTE_MS = 60 * 1000;
  const HIGH_DISTRACTION_THRESHOLD_MS = 30 * MINUTE_MS;
  const POSITIVE_MISSION_THRESHOLD = 0.8;
  const LOW_MISSION_THRESHOLD = 0.5;

  // This conservative list is only used to surface attention signals. It does
  // not assign value or intent to a domain, and can be made user-configurable.
  const ATTENTION_HEAVY_DOMAINS = new Set([
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "twitch.tv",
    "x.com",
    "youtube.com",
  ]);

  function toDateKey(date = new Date()) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }

    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getDateRange(date) {
    const dateKey = toDateKey(date);
    const [year, month, day] = dateKey.split("-").map(Number);
    const start = new Date(year, month - 1, day, 0, 0, 0, 0);
    const end = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { dateKey, start, end };
  }

  function categorizeEvents(events, eventTypes) {
    const categories = {
      missionEvents: [],
      moodEvents: [],
      browserEvents: [],
      commandCenterEvents: [],
      onboardingEvents: [],
    };

    events.forEach((event) => {
      switch (event.type) {
        case eventTypes.MISSION_COMPLETED:
        case eventTypes.MISSION_UNCOMPLETED:
          categories.missionEvents.push(event);
          break;
        case eventTypes.MOOD_SELECTED:
          categories.moodEvents.push(event);
          break;
        case eventTypes.BROWSER_SITE_SESSION:
          categories.browserEvents.push(event);
          break;
        case eventTypes.COMMAND_CENTER_OPENED:
          categories.commandCenterEvents.push(event);
          break;
        case eventTypes.ONBOARDING_COMPLETED:
          categories.onboardingEvents.push(event);
          break;
        default:
          break;
      }
    });

    return categories;
  }

  function analyzeMissions(missionEvents, commandCenterEvents, eventTypes) {
    const plannedMissionIds = new Set();
    commandCenterEvents.forEach((event) => {
      const planned = event.metadata?.plannedMissions;
      if (Array.isArray(planned)) {
        planned.forEach((mission) => {
          const missionId =
            typeof mission === "string" ? mission : mission?.missionId ?? mission?.id;
          if (missionId) {
            plannedMissionIds.add(missionId);
          }
        });
      }
    });

    const latestMissionState = new Map();
    missionEvents.forEach((event) => {
      const missionId = event.metadata?.missionId;
      if (!missionId) {
        return;
      }
      plannedMissionIds.add(missionId);
      latestMissionState.set(
        missionId,
        event.type === eventTypes.MISSION_COMPLETED,
      );
    });

    const total = plannedMissionIds.size;
    const completed = [...latestMissionState.values()].filter(Boolean).length;
    return {
      total,
      completed,
      completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
      activityCount: missionEvents.length,
    };
  }

  function analyzeMood(moodEvents) {
    const latest = moodEvents.at(-1);
    return { selected: latest?.metadata?.mood ?? null };
  }

  function analyzeBrowser(browserEvents) {
    const totals = new Map();
    browserEvents.forEach((event) => {
      const domain = event.metadata?.domain;
      const durationMs = event.metadata?.durationMs;
      if (!domain || !Number.isFinite(durationMs) || durationMs <= 0) {
        return;
      }
      totals.set(domain, (totals.get(domain) ?? 0) + durationMs);
    });

    const allDomains = [...totals.entries()]
      .map(([domain, durationMs]) => ({ domain, durationMs }))
      .sort(
        (first, second) =>
          second.durationMs - first.durationMs ||
          first.domain.localeCompare(second.domain),
      );

    return {
      totalObservedMs: allDomains.reduce(
        (total, domain) => total + domain.durationMs,
        0,
      ),
      topDomains: allDomains.slice(0, 10),
    };
  }

  function detectPatterns({ missions, browser }) {
    const patterns = [];

    if (missions.total > 0 && missions.activityCount === 0) {
      patterns.push({
        type: "NO_MISSION_ACTIVITY",
        severity: "attention",
      });
    } else if (missions.total > 0 && missions.completionRate >= POSITIVE_MISSION_THRESHOLD) {
      patterns.push({
        type: "STRONG_MISSION_COMPLETION",
        severity: "positive",
      });
    } else if (missions.total > 0 && missions.completionRate < LOW_MISSION_THRESHOLD) {
      patterns.push({
        type: "LOW_MISSION_COMPLETION",
        severity: "attention",
      });
    }

    browser.topDomains.forEach(({ domain, durationMs }) => {
      if (
        ATTENTION_HEAVY_DOMAINS.has(domain) &&
        durationMs > HIGH_DISTRACTION_THRESHOLD_MS
      ) {
        patterns.push({
          type: "HIGH_DISTRACTION_TIME",
          severity: "info",
          domain,
          durationMs,
        });
      }
    });

    if (browser.totalObservedMs === 0) {
      patterns.push({
        type: "LIMITED_BROWSER_DATA",
        severity: "info",
      });
    }

    return patterns;
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
  }

  function formatSummaryDuration(durationMs) {
    const totalMinutes = Math.round(durationMs / MINUTE_MS);
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
    }
    return `${totalMinutes}m`;
  }

  function createSummaries({ missions, browser, patterns }) {
    const highlights = [];
    const misses = [];

    if (missions.total > 0 && missions.completed > 0) {
      highlights.push(
        `You completed ${missions.completed} of ${missions.total} missions.`,
      );
    }

    const unfinished = Math.max(0, missions.total - missions.completed);
    if (unfinished > 0 && missions.activityCount > 0) {
      misses.push(
        `${unfinished} ${pluralize(unfinished, "mission")} ${
          unfinished === 1 ? "was" : "were"
        } left unfinished.`,
      );
    }

    browser.topDomains
      .filter(({ durationMs }) => durationMs >= 60 * MINUTE_MS)
      .slice(0, 2)
      .forEach(({ domain, durationMs }) => {
        highlights.push(
          `${formatSummaryDuration(durationMs)} observed on ${domain}.`,
        );
      });

    patterns
      .filter(({ type }) => type === "HIGH_DISTRACTION_TIME")
      .forEach(({ domain, durationMs }) => {
        misses.push(
          `${formatSummaryDuration(durationMs)} observed on ${domain}.`,
        );
      });

    return { highlights, misses };
  }

  function determineVerdict({ eventCount, missions, browser, mood }) {
    const hasMeaningfulActivity =
      missions.total > 0 ||
      missions.activityCount > 0 ||
      browser.totalObservedMs > 0 ||
      mood.selected !== null;

    if (eventCount === 0 || !hasMeaningfulActivity) {
      return "INSUFFICIENT_DATA";
    }
    if (missions.total === 0) {
      return "INSUFFICIENT_DATA";
    }
    if (missions.completionRate >= 0.8) {
      return "STRONG";
    }
    if (missions.completionRate >= 0.6) {
      return "SOLID";
    }
    if (missions.completionRate >= 0.4) {
      return "MIXED";
    }
    return "NEEDS_ATTENTION";
  }

  const auditUtils = {
    ATTENTION_HEAVY_DOMAINS,
    HIGH_DISTRACTION_THRESHOLD_MS,
    toDateKey,
    getDateRange,
    categorizeEvents,
    analyzeMissions,
    analyzeMood,
    analyzeBrowser,
    detectPatterns,
    createSummaries,
    determineVerdict,
    formatSummaryDuration,
  };

  globalScope.LockInAuditUtils = auditUtils;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = auditUtils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
