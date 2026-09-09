const test = require("node:test");
const assert = require("node:assert/strict");

const {
  EventApi,
  EventStore,
  EventTypes,
  countEvents,
  getEventsForArc,
  getEventsForDate,
  getTodayEvents,
} = require("../src/core/event-engine.js");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async getAll() {
    return Object.fromEntries(this.values);
  }

  async setItem(key, value) {
    this.values.set(key, value);
  }

  async removeItems(keys) {
    keys.forEach((key) => this.values.delete(key));
  }
}

test("records and retrieves multiple persistent events", async () => {
  const persistence = new MemoryStorage();
  const firstStore = new EventStore(persistence);
  const api = new EventApi(firstStore);

  await api.record(EventTypes.MOOD_SELECTED, { mood: "GOOD" });
  await api.record(EventTypes.MISSION_COMPLETED, { missionId: "build" });

  await api.record(EventTypes.FITNESS_CHECKIN, { activity: "run", durationMin: 30 });
  await api.record(EventTypes.SLEEP_CHECKIN, { hours: 7.2 });

  const refreshedStore = new EventStore(persistence);
  const events = await refreshedStore.getEvents();

  assert.equal(events.length, 4);
  assert.equal(events[0].type, EventTypes.MOOD_SELECTED);
  assert.match(events[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    (await refreshedStore.getEventsByType(EventTypes.MISSION_COMPLETED)).length,
    1,
  );
});

test("filters events by time, date, arc, and type count", () => {
  const events = [
    {
      id: "one",
      type: EventTypes.MOOD_SELECTED,
      timestamp: "2026-09-07T10:00:00.000Z",
      metadata: {},
      source: "lock-in",
    },
    {
      id: "two",
      type: EventTypes.MISSION_COMPLETED,
      timestamp: "2026-09-10T10:00:00.000Z",
      metadata: {},
      source: "lock-in",
    },
  ];

  assert.equal(getEventsForDate(events, new Date("2026-09-07T12:00:00")).length, 1);
  assert.equal(getTodayEvents(events, new Date("2026-09-10T12:00:00")).length, 1);
  assert.equal(
    getEventsForArc(
      events,
      "2026-09-07T00:00:00.000Z",
      "2026-12-31T23:59:59.999Z",
    ).length,
    2,
  );
  assert.equal(countEvents(events, EventTypes.MOOD_SELECTED), 1);
});

test("clears all events", async () => {
  const persistence = new MemoryStorage();
  const store = new EventStore(persistence);
  const api = new EventApi(store);

  await api.record(EventTypes.COMMAND_CENTER_OPENED);
  assert.equal((await api.getEvents()).length, 1);
  assert.equal(await api.clearEvents(), true);
  assert.deepEqual(await api.getEvents(), []);
});

test("persistence errors do not escape into the application", async () => {
  const brokenPersistence = {
    async getAll() {
      return {};
    },
    async setItem() {
      throw new Error("Storage unavailable");
    },
    async removeItems() {},
  };
  const originalError = console.error;
  console.error = () => {};

  try {
    const api = new EventApi(new EventStore(brokenPersistence));
    assert.equal(await api.record(EventTypes.MOOD_SELECTED, { mood: "LOW" }), null);
  } finally {
    console.error = originalError;
  }
});

test("records goal archive and completion events", async () => {
  const api = new EventApi(new EventStore(new MemoryStorage()));
  await api.record(EventTypes.GOAL_ARCHIVED, { goalId: "goal-primary", status: "cancelled" });
  await api.record(EventTypes.GOAL_COMPLETED, { goalId: "goal-primary", status: "completed" });
  const events = await api.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    [EventTypes.GOAL_ARCHIVED, EventTypes.GOAL_COMPLETED],
  );
});

test("records behavior create, pause, and archive events", async () => {
  const api = new EventApi(new EventStore(new MemoryStorage()));
  await api.record(EventTypes.BEHAVIOR_CREATED, {
    behaviorId: "run",
    goalId: "goal-half",
    title: "Run 3x/week",
  });
  await api.record(EventTypes.BEHAVIOR_PAUSED, { behaviorId: "run", status: "paused" });
  await api.record(EventTypes.BEHAVIOR_ARCHIVED, { behaviorId: "run", status: "archived" });
  const events = await api.getEvents();
  assert.deepEqual(
    events.map((event) => event.type),
    [
      EventTypes.BEHAVIOR_CREATED,
      EventTypes.BEHAVIOR_PAUSED,
      EventTypes.BEHAVIOR_ARCHIVED,
    ],
  );
});
