(function initializeAuditService(globalScope) {
  const auditUtils =
    globalScope.LockInAuditUtils ??
    (typeof require === "function" ? require("./auditUtils.js") : null);
  const eventEngine =
    globalScope.LockInEvents ??
    (typeof require === "function" ? require("../core/event-engine.js") : null);

  const AUDIT_STORAGE_PREFIX = "lock-in-daily-audit:";

  class AuditStore {
    constructor(persistence, storagePrefix = AUDIT_STORAGE_PREFIX) {
      this.persistence = persistence;
      this.storagePrefix = storagePrefix;
    }

    getKey(date) {
      return `${this.storagePrefix}${auditUtils.toDateKey(date)}`;
    }

    async save(audit) {
      try {
        await this.persistence.setItem(this.getKey(audit.date), audit);
        return audit;
      } catch (error) {
        console.error("LOCK IN audit persistence failed", error);
        return null;
      }
    }

    async get(date) {
      try {
        const values = await this.persistence.getAll();
        return values[this.getKey(date)] ?? null;
      } catch (error) {
        console.error("LOCK IN audit retrieval failed", error);
        return null;
      }
    }
  }

  class AuditService {
    constructor({
      eventStore,
      persistence,
      eventTypes = eventEngine.EventTypes,
      now = () => new Date(),
    }) {
      this.eventStore = eventStore;
      this.eventTypes = eventTypes;
      this.now = now;
      this.auditStore = new AuditStore(persistence);
    }

    async generateDailyAudit(date = this.now()) {
      const { dateKey, start, end } = auditUtils.getDateRange(date);
      const events = await this.eventStore.getEventsBetween(start, end);
      const categories = auditUtils.categorizeEvents(events, this.eventTypes);
      const missionAnalysis = auditUtils.analyzeMissions(
        categories.missionEvents,
        categories.commandCenterEvents,
        this.eventTypes,
      );
      const mood = auditUtils.analyzeMood(categories.moodEvents);
      const browser = auditUtils.analyzeBrowser(categories.browserEvents);
      const patterns = auditUtils.detectPatterns({
        missions: missionAnalysis,
        browser,
      });
      const summaries = auditUtils.createSummaries({
        missions: missionAnalysis,
      });
      const guidance = auditUtils.createGuidance({
        missions: missionAnalysis,
        mood,
        browser,
      });

      const audit = {
        schemaVersion: 3,
        date: dateKey,
        missions: {
          total: missionAnalysis.total,
          completed: missionAnalysis.completed,
          completionRate: missionAnalysis.completionRate,
          levels: missionAnalysis.levels,
          byGoal: missionAnalysis.byGoal,
          milestoneTasksCompleted: missionAnalysis.milestoneTasksCompleted,
        },
        mood,
        browser,
        behavior: {
          commandCenterOpened: categories.commandCenterEvents.length > 0,
          onboardingCompleted: categories.onboardingEvents.length > 0,
          weeklyReviewCompleted: categories.weeklyReviewEvents.length > 0,
          goalActivityCount: categories.goalEvents.length,
        },
        highlights: summaries.highlights,
        misses: summaries.misses,
        patterns,
        guidance,
        verdict: auditUtils.determineVerdict({
          eventCount: events.length,
          missions: missionAnalysis,
          browser,
          mood,
        }),
        generatedAt: this.now().toISOString(),
      };

      await this.auditStore.save(audit);
      return audit;
    }

    async getPersistedAudit(date) {
      return this.auditStore.get(date);
    }
  }

  const auditService = {
    AUDIT_STORAGE_PREFIX,
    AuditStore,
    AuditService,
  };

  globalScope.LockInAudit = auditService;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = auditService;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
