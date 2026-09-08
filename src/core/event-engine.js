(function initializeEventEngine(globalScope) {
  const EVENT_STORAGE_PREFIX = "lock-in-life-event:";

  const EventTypes = Object.freeze({
    MISSION_COMPLETED: "MISSION_COMPLETED",
    MISSION_UNCOMPLETED: "MISSION_UNCOMPLETED",
    MOOD_SELECTED: "MOOD_SELECTED",
    ONBOARDING_COMPLETED: "ONBOARDING_COMPLETED",
    COMMAND_CENTER_OPENED: "COMMAND_CENTER_OPENED",
    BROWSER_SITE_SESSION: "BROWSER_SITE_SESSION",
    GOAL_CREATED: "GOAL_CREATED",
    GOAL_UPDATED: "GOAL_UPDATED",
    GOAL_PROGRESS_UPDATED: "GOAL_PROGRESS_UPDATED",
    GOAL_ARCHIVED: "GOAL_ARCHIVED",
    GOAL_COMPLETED: "GOAL_COMPLETED",
    MILESTONE_TASK_COMPLETED: "MILESTONE_TASK_COMPLETED",
    WEEKLY_REVIEW_COMPLETED: "WEEKLY_REVIEW_COMPLETED",
    FITNESS_CHECKIN: "FITNESS_CHECKIN",
    SLEEP_CHECKIN: "SLEEP_CHECKIN",
    ENERGY_CHECKIN: "ENERGY_CHECKIN",
    EXPERIMENT_MEASURE: "EXPERIMENT_MEASURE",
    EXPERIMENT_STARTED: "EXPERIMENT_STARTED",
    EXPERIMENT_COMPLETED: "EXPERIMENT_COMPLETED",
    PLAN_ADAPTED: "PLAN_ADAPTED",
    BEHAVIOR_UPDATED: "BEHAVIOR_UPDATED",
  });

  const supportedEventTypes = new Set(Object.values(EventTypes));

  function createEvent(
    type,
    metadata = {},
    source = "lock-in",
    timestamp = new Date().toISOString(),
  ) {
    if (!supportedEventTypes.has(type)) {
      throw new Error(`Unsupported event type: ${type}`);
    }

    return {
      id:
        globalScope.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      timestamp,
      metadata: { ...metadata },
      source,
    };
  }

  function getEventsBetween(events, start, end) {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return events.filter((event) => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime >= startTime && eventTime <= endTime;
    });
  }

  function getEventsForDate(events, date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return getEventsBetween(events, start, end);
  }

  function getTodayEvents(events, now = new Date()) {
    return getEventsForDate(events, now);
  }

  function getEventsForArc(events, start, end) {
    return getEventsBetween(events, start, end);
  }

  function countEvents(events, type) {
    return events.filter((event) => event.type === type).length;
  }

  class LocalStorageEventAdapter {
    constructor(localStorageInstance) {
      this.storage = localStorageInstance;
    }

    async getAll() {
      const values = {};
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index);
        const value = this.storage.getItem(key);
        try {
          values[key] = JSON.parse(value);
        } catch {
          values[key] = value;
        }
      }
      return values;
    }

    async setItem(key, value) {
      this.storage.setItem(key, JSON.stringify(value));
    }

    async removeItems(keys) {
      keys.forEach((key) => this.storage.removeItem(key));
    }
  }

  class ChromeStorageEventAdapter {
    constructor(storageArea) {
      this.storage = storageArea;
    }

    async getAll() {
      return this.storage.get(null);
    }

    async setItem(key, value) {
      await this.storage.set({ [key]: value });
    }

    async removeItems(keys) {
      await this.storage.remove(keys);
    }
  }

  class EventStore {
    constructor(persistence, storagePrefix = EVENT_STORAGE_PREFIX) {
      this.persistence = persistence;
      this.storagePrefix = storagePrefix;
    }

    async recordEvent(event) {
      try {
        await this.persistence.setItem(`${this.storagePrefix}${event.id}`, event);
        return event;
      } catch (error) {
        console.error("LOCK IN event recording failed", error);
        return null;
      }
    }

    async getEvents() {
      try {
        const storedValues = await this.persistence.getAll();
        return Object.entries(storedValues)
          .filter(([key]) => key.startsWith(this.storagePrefix))
          .map(([, event]) => event)
          .sort(
            (first, second) =>
              new Date(first.timestamp).getTime() -
              new Date(second.timestamp).getTime(),
          );
      } catch (error) {
        console.error("LOCK IN event retrieval failed", error);
        return [];
      }
    }

    async getEventsBetween(start, end) {
      return getEventsBetween(await this.getEvents(), start, end);
    }

    async getEventsByType(type) {
      return (await this.getEvents()).filter((event) => event.type === type);
    }

    async clearEvents() {
      try {
        const storedValues = await this.persistence.getAll();
        const eventKeys = Object.keys(storedValues).filter((key) =>
          key.startsWith(this.storagePrefix),
        );
        await this.persistence.removeItems(eventKeys);
        return true;
      } catch (error) {
        console.error("LOCK IN event clearing failed", error);
        return false;
      }
    }
  }

  class EventApi {
    constructor(store) {
      this.store = store;
    }

    async record(
      type,
      metadata = {},
      source = "lock-in",
      timestamp = new Date().toISOString(),
    ) {
      try {
        return await this.store.recordEvent(
          createEvent(type, metadata, source, timestamp),
        );
      } catch (error) {
        console.error("LOCK IN event creation failed", error);
        return null;
      }
    }

    async getEvents() {
      return this.store.getEvents();
    }

    async getEventsBetween(start, end) {
      return this.store.getEventsBetween(start, end);
    }

    async getEventsByType(type) {
      return this.store.getEventsByType(type);
    }

    async clearEvents() {
      return this.store.clearEvents();
    }
  }

  const eventEngine = {
    EventTypes,
    EventStore,
    EventApi,
    LocalStorageEventAdapter,
    ChromeStorageEventAdapter,
    createEvent,
    getEventsBetween,
    getEventsForDate,
    getTodayEvents,
    getEventsForArc,
    countEvents,
  };

  globalScope.LockInEvents = eventEngine;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = eventEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
