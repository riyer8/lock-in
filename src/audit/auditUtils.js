(function initializeAuditUtils(globalScope) {
  const MINUTE_MS = 60 * 1000;
  const HIGH_DISTRACTION_THRESHOLD_MS = 30 * MINUTE_MS;
  const POSITIVE_MISSION_THRESHOLD = 0.8;
  const LOW_MISSION_THRESHOLD = 0.5;

  // This conservative list is only used to surface attention signals. It does
  // not assign value or intent to a domain, and can be made user-configurable.
  const ATTENTION_HEAVY_DOMAINS = new Set([
    "instagram.com",
    "x.com",
    "youtube.com",
    ...(
      globalScope.LOCK_IN_PERSONAL_CONFIG?.attentionDomains ?? []
    ).filter((domain) => typeof domain === "string"),
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
      goalEvents: [],
      weeklyReviewEvents: [],
      checkinEvents: [],
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
        case eventTypes.GOAL_CREATED:
        case eventTypes.GOAL_UPDATED:
        case eventTypes.GOAL_PROGRESS_UPDATED:
        case eventTypes.MILESTONE_TASK_COMPLETED:
          categories.goalEvents.push(event);
          break;
        case eventTypes.WEEKLY_REVIEW_COMPLETED:
          categories.weeklyReviewEvents.push(event);
          break;
        case eventTypes.FITNESS_CHECKIN:
        case eventTypes.SLEEP_CHECKIN:
        case eventTypes.ENERGY_CHECKIN:
        case eventTypes.EXPERIMENT_MEASURE:
          categories.checkinEvents.push(event);
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
      latestMissionState.set(missionId, {
        completed: event.type === eventTypes.MISSION_COMPLETED,
        goalId: event.metadata?.goalId ?? null,
        level: event.metadata?.level ?? null,
        milestoneTaskId: event.metadata?.milestoneTaskId ?? null,
      });
    });

    const total = plannedMissionIds.size;
    const completedStates = [...latestMissionState.values()].filter(
      ({ completed: isComplete }) => isComplete,
    );
    const completed = completedStates.length;
    const levels = completedStates.reduce(
      (counts, state) => {
        const level = ["minimum", "standard", "stretch"].includes(state.level)
          ? state.level
          : "standard";
        counts[level] += 1;
        return counts;
      },
      { minimum: 0, standard: 0, stretch: 0 },
    );
    const byGoal = completedStates.reduce((counts, state) => {
      if (state.goalId) {
        counts[state.goalId] = (counts[state.goalId] ?? 0) + 1;
      }
      return counts;
    }, {});
    return {
      total,
      completed,
      completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
      activityCount: missionEvents.length,
      levels,
      byGoal,
      milestoneTasksCompleted: completedStates.filter(
        ({ milestoneTaskId }) => milestoneTaskId,
      ).length,
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

  function createSummaries({ missions }) {
    const highlights = [];
    const misses = [];

    if (missions.total > 0 && missions.completed > 0) {
      highlights.push(
        `You completed ${missions.completed} of ${missions.total} missions.`,
      );
    }
    if (missions.levels?.minimum > 0) {
      highlights.push(
        `${missions.levels.minimum} minimum-version ${missions.levels.minimum === 1 ? "action kept" : "actions kept"
        } momentum alive.`,
      );
    }
    if (missions.milestoneTasksCompleted > 0) {
      highlights.push("You prepared for a milestone that matters to you.");
    }

    const unfinished = Math.max(0, missions.total - missions.completed);
    if (unfinished > 0 && missions.activityCount > 0) {
      misses.push(
        `${unfinished} ${pluralize(unfinished, "mission")} ${unfinished === 1 ? "was" : "were"
        } left unfinished.`,
      );
    }

    return { highlights, misses };
  }

  function analyzeCheckins(checkinEvents, eventTypes) {
    const sleepEvents = checkinEvents.filter(
      (event) => event.type === eventTypes.SLEEP_CHECKIN,
    );
    const energyEvents = checkinEvents.filter(
      (event) => event.type === eventTypes.ENERGY_CHECKIN,
    );
    const fitnessEvents = checkinEvents.filter(
      (event) => event.type === eventTypes.FITNESS_CHECKIN,
    );
    const latestSleep = sleepEvents.at(-1);
    const latestEnergy = energyEvents.at(-1);
    return {
      sleepHours: latestSleep ? Number(latestSleep.metadata?.hours) || null : null,
      energyScore: latestEnergy ? Number(latestEnergy.metadata?.score) || null : null,
      energyAt: latestEnergy?.metadata?.at ?? null,
      fitness: fitnessEvents.map((event) => ({
        activity: event.metadata?.activity || "movement",
        durationMin: Number(event.metadata?.durationMin) || 0,
        source: event.source || "manual",
      })),
    };
  }

  function createNarrative({ missions, checkins, browser, plannedTitles = [] }) {
    const happened = [];
    const missed = [];
    if (missions.total > 0) {
      happened.push({
        label: `${missions.completed}/${missions.total} important actions`,
        evidence: "missions",
      });
    }
    if (checkins.sleepHours) {
      happened.push({
        label: `${checkins.sleepHours}h sleep`,
        evidence: "sleep",
      });
    }
    if (checkins.fitness.length) {
      const minutes = checkins.fitness.reduce(
        (total, item) => total + (item.durationMin || 0),
        0,
      );
      const activity = checkins.fitness[0].activity;
      happened.push({
        label: minutes ? `${minutes}m ${activity}` : activity,
        evidence: "fitness",
      });
    }
    const unfinished = Math.max(0, missions.total - missions.completed);
    if (unfinished > 0) {
      const titles = plannedTitles.filter(Boolean).slice(0, unfinished);
      if (titles.length) {
        titles.forEach((title) => missed.push({ label: title, evidence: "mission" }));
      } else {
        missed.push({
          label: `${unfinished} important ${unfinished === 1 ? "action" : "actions"}`,
          evidence: "mission",
        });
      }
    }
    if (
      browser.totalObservedMs > 2 * 60 * 60 * 1000 &&
      unfinished > 0
    ) {
      happened.push({
        label: "A long browser day",
        evidence: "browser",
      });
    }
    return { happened, missed };
  }

  function createGuidance({ missions, mood, browser }) {
    const unfinished = Math.max(0, missions.total - missions.completed);
    let focus;

    if (missions.total === 0) {
      focus = "Choose one thing that would make your next day feel meaningful.";
    } else if (missions.activityCount === 0) {
      focus = "Start with one mission. One small action is enough to begin.";
    } else if (unfinished > 0) {
      focus =
        unfinished === 1
          ? "Decide whether the unfinished mission is worth carrying forward."
          : "Choose one unfinished mission that is worth carrying forward.";
    } else {
      focus = "Keep the next plan simple and protect time for what matters most.";
    }

    let addMore;
    if (mood.selected === null) {
      addMore = "Add a quick mood check-in next time for more context.";
    } else if (browser.totalObservedMs === 0) {
      addMore = "Keep browser observation on for a clearer picture of your attention.";
    } else if (missions.completionRate >= POSITIVE_MISSION_THRESHOLD) {
      addMore = "Add one thing you genuinely want to look forward to.";
    } else {
      addMore = "Add one small action that supports your most important mission.";
    }

    const makeItInteresting =
      missions.completionRate >= POSITIVE_MISSION_THRESHOLD
        ? "Try something different next time: a new place, recipe, playlist, or activity."
        : "Choose one small novelty next time: a new place, route, recipe, playlist, or activity.";

    return { focus, addMore, makeItInteresting };
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
    analyzeCheckins,
    createNarrative,
    createGuidance,
    determineVerdict,
  };

  globalScope.LockInAuditUtils = auditUtils;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = auditUtils;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
