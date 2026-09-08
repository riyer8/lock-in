const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const ARC_START = Date.UTC(2026, 8, 7);
const ARC_END = Date.UTC(2026, 11, 31);
const IDENTITIES_STORAGE_KEY = "lock-in-identities";
const ATTENTION_AREAS_STORAGE_KEY = "lock-in-attention-areas";
const OBSTACLES_STORAGE_KEY = "lock-in-obstacles";
const CONTEXT_STORAGE_KEY = "lock-in-starting-context";
const ONBOARDING_COMPLETE_STORAGE_KEY = "lock-in-onboarding-complete";
const NAME_STORAGE_KEY = "lock-in-name";

const storage = {
  readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  readText(key) {
    return localStorage.getItem(key) ?? "";
  },
  writeText(key, value) {
    localStorage.setItem(key, value);
  },
};

const eventPersistence = globalThis.chrome?.storage?.local
  ? new LockInEvents.ChromeStorageEventAdapter(chrome.storage.local)
  : new LockInEvents.LocalStorageEventAdapter(localStorage);
const eventStore = new LockInEvents.EventStore(eventPersistence);
const eventApi = new LockInEvents.EventApi(eventStore);
const { EventTypes } = LockInEvents;

const IDENTITY_LABELS = {
  athlete: "ATHLETE",
  thinker: "THINKER",
  builder: "BUILDER",
  "glow-up": "GLOW UP",
  explorer: "EXPLORER",
  connected: "CONNECTED",
};

const AREA_BLUEPRINTS = {
  "health-food": {
    label: "HEALTH & FOOD",
    description: "We're building steadier energy and care for your body.",
  },
  fitness: {
    label: "FITNESS",
    description: "We're rebuilding consistency and capability.",
  },
  "energy-recovery": {
    label: "ENERGY & RECOVERY",
    description: "Your energy and recovery need attention.",
  },
  mind: {
    label: "MIND",
    description: "We're protecting focus, clarity, and confidence.",
  },
  career: {
    label: "CAREER",
    description: "We're making room for learning, building, and growth.",
  },
  appearance: {
    label: "APPEARANCE",
    description: "We're strengthening the care that helps you feel confident.",
  },
  environment: {
    label: "ENVIRONMENT",
    description: "We're shaping surroundings that support your life.",
  },
  "social-life": {
    label: "SOCIAL & LIFE",
    description: "We're making space for people, experiences, and connection.",
  },
  "digital-life": {
    label: "DIGITAL LIFE",
    description: "We're reducing distraction and reclaiming attention.",
  },
};

const OBSTACLE_LABELS = {
  "low-energy": "LOW ENERGY",
  consistency: "INCONSISTENCY",
  procrastination: "PROCRASTINATION",
  distraction: "DISTRACTION",
  "chaotic-schedule": "CHAOTIC SCHEDULE",
  priorities: "UNCLEAR PRIORITIES",
  "fall-off": "LOSING MOMENTUM",
  motivation: "RELYING ON MOTIVATION",
  overwhelmed: "OVERWHELM",
  "not-sure": "NOT SURE",
};

const MISSION_CATALOG = [
  {
    id: "move",
    category: "FITNESS",
    title: "MOVE YOUR BODY",
    description: "Complete today's planned workout or intentional movement.",
    target: "INTENTIONAL MOVEMENT",
    matches: ({ identities, areas }) =>
      identities.has("athlete") || areas.has("fitness"),
  },
  {
    id: "nourish",
    category: "HEALTH & FOOD",
    title: "FEED YOURSELF WELL",
    description: "Choose a nourishing meal that supports steady energy.",
    target: "ONE GOOD MEAL",
    matches: ({ areas }) => areas.has("health-food"),
  },
  {
    id: "build",
    category: "CAREER",
    title: "BUILD",
    description:
      "Spend 60 focused minutes creating or learning something meaningful.",
    target: "60 FOCUSED MINUTES",
    matches: ({ identities, areas }) =>
      identities.has("builder") || areas.has("career"),
  },
  {
    id: "focus",
    category: "MIND",
    title: "PROTECT YOUR ATTENTION",
    description:
      "Complete one focused block without unnecessary distractions.",
    target: "ONE FOCUSED BLOCK",
    matches: ({ identities, areas }) =>
      identities.has("thinker") ||
      areas.has("mind") ||
      areas.has("digital-life"),
  },
  {
    id: "live",
    category: "LIFE",
    title: "LIVE",
    description:
      "Do one thing that gets you out of work mode and into your actual life.",
    matches: ({ identities, areas }) =>
      identities.has("connected") ||
      identities.has("explorer") ||
      areas.has("social-life"),
  },
  {
    id: "recover",
    category: "RECOVERY",
    title: "RECOVER ON PURPOSE",
    description: "Make space for a real pause before your energy runs out.",
    matches: ({ areas }) => areas.has("energy-recovery"),
  },
  {
    id: "reset-space",
    category: "ENVIRONMENT",
    title: "RESET YOUR SPACE",
    description: "Improve one space that shapes how your day feels.",
    matches: ({ areas }) => areas.has("environment"),
  },
  {
    id: "self-care",
    category: "APPEARANCE",
    title: "SHOW UP FOR YOURSELF",
    description: "Choose one act of care that helps you feel put together.",
    matches: ({ identities, areas }) =>
      identities.has("glow-up") || areas.has("appearance"),
  },
];

const FALLBACK_MISSIONS = [
  {
    id: "choose-one",
    category: "FOCUS",
    title: "CHOOSE ONE THING",
    description: "Decide what matters most and give it your full attention.",
  },
  {
    id: "keep-promise",
    category: "ARC",
    title: "KEEP ONE PROMISE",
    description: "Follow through on one commitment you made to yourself.",
  },
  {
    id: "close-day",
    category: "LIFE",
    title: "CLOSE THE LOOP",
    description: "Finish one open loop that has been taking up space.",
  },
];

const MOOD_RESPONSES = {
  low: "Okay. Today is a minimum-viable day. We protect your energy.",
  meh: "We don't need a perfect day. Let's get a few wins.",
  good: "Perfect. Let's use it.",
  "locked-in": "Then let's make today count.",
};

const MOOD_LABELS = {
  low: "LOW",
  meh: "MEH",
  good: "GOOD",
  "locked-in": "LOCKED IN",
};

const daysRemainingElement = document.querySelector("#days-remaining");
const arcDayElement = document.querySelector("#arc-day");
const screens = document.querySelectorAll(".screen");
const enterArcButton = document.querySelector("#enter-arc");
const identityCards = [...document.querySelectorAll(".identity-card")];
const identityContinueButton = document.querySelector("#identity-continue");
const attentionCards = [...document.querySelectorAll(".attention-card")];
const obstacleButtons = [...document.querySelectorAll("[data-obstacle]")];
const detailsSection = document.querySelector("#details-section");
const startingContext = document.querySelector("#starting-context");
const fixingContinueButton = document.querySelector("#fixing-continue");
const blueprintIdentities = document.querySelector("#blueprint-identities");
const blueprintAreas = document.querySelector("#blueprint-areas");
const blueprintObstacles = document.querySelector("#blueprint-obstacles");
const startArcButton = document.querySelector("#start-arc");
const commandArcDay = document.querySelector("#command-arc-day");
const commandGreeting = document.querySelector("#command-greeting");
const missionList = document.querySelector("#mission-list");
const progressDay = document.querySelector("#progress-day");
const arcProgress = document.querySelector("#arc-progress");
const arcProgressFill = document.querySelector("#arc-progress-fill");
const moodButtons = [...document.querySelectorAll("[data-mood]")];
const moodResponse = document.querySelector("#mood-response");
const bodyState = document.querySelector("#body-state");
const mindState = document.querySelector("#mind-state");
const lifeState = document.querySelector("#life-state");
const eventList = document.querySelector("#event-list");
const clearEventsButton = document.querySelector("#clear-events");
const closeEventsButton = document.querySelector("#close-events");
const observerStatus = document.querySelector("#observer-status");
const observerStatusDot = document.querySelector("#observer-status-dot");
const observerDomain = document.querySelector("#observer-domain");
const observerDuration = document.querySelector("#observer-duration");
const observerTotal = document.querySelector("#observer-total");
const observerDomains = document.querySelector("#observer-domains");

function toUtcDate(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function calculateArcState(date) {
  const today = toUtcDate(date);
  const totalDays = Math.round((ARC_END - ARC_START) / MILLISECONDS_PER_DAY) + 1;
  const currentDay = Math.floor((today - ARC_START) / MILLISECONDS_PER_DAY) + 1;
  const daysRemaining = Math.max(
    0,
    Math.ceil((ARC_END - today) / MILLISECONDS_PER_DAY),
  );

  return { currentDay, daysRemaining, totalDays };
}

function getArcDayLabel({ currentDay, totalDays }) {
  if (currentDay < 1) {
    return `THE ARC BEGINS IN ${1 - currentDay} DAYS`;
  }

  if (currentDay > totalDays) {
    return `ARC COMPLETE | ${totalDays} DAYS`;
  }

  return `DAY ${currentDay} OF ${totalDays}`;
}

function renderArcState() {
  const arcState = calculateArcState(new Date());

  daysRemainingElement.textContent = arcState.daysRemaining;
  arcDayElement.textContent = getArcDayLabel(arcState);
}

function loadSavedSet(storageKey) {
  const savedValues = storage.readJson(storageKey, []);
  return Array.isArray(savedValues) ? new Set(savedValues) : new Set();
}

const selectedIdentities = loadSavedSet(IDENTITIES_STORAGE_KEY);
const selectedAttentionAreas = loadSavedSet(ATTENTION_AREAS_STORAGE_KEY);
const selectedObstacles = loadSavedSet(OBSTACLES_STORAGE_KEY);

function saveSet(storageKey, values) {
  storage.writeJson(storageKey, [...values]);
}

function renderIdentitySelections() {
  identityCards.forEach((card) => {
    const isSelected = selectedIdentities.has(card.dataset.identity);
    card.setAttribute("aria-pressed", String(isSelected));
    card.querySelector(".identity-card__mark").textContent = isSelected
      ? "✓"
      : "+";
  });

  identityContinueButton.disabled = selectedIdentities.size === 0;
}

function renderStartingPoint() {
  attentionCards.forEach((card) => {
    card.setAttribute(
      "aria-pressed",
      String(selectedAttentionAreas.has(card.dataset.area)),
    );
  });

  obstacleButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(selectedObstacles.has(button.dataset.obstacle)),
    );
  });

  const hasAttentionArea = selectedAttentionAreas.size > 0;
  detailsSection.hidden = !hasAttentionArea;
  fixingContinueButton.disabled = !hasAttentionArea;
}

function toggleSavedSelection(values, value, storageKey) {
  if (values.has(value)) {
    values.delete(value);
  } else {
    values.add(value);
  }

  saveSet(storageKey, values);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function renderBlueprint() {
  const identityElements = [...selectedIdentities]
    .filter((identity) => IDENTITY_LABELS[identity])
    .map((identity) =>
      createTextElement("span", "blueprint-identity", IDENTITY_LABELS[identity]),
    );
  blueprintIdentities.replaceChildren(...identityElements);

  const areaElements = [...selectedAttentionAreas]
    .filter((area) => AREA_BLUEPRINTS[area])
    .map((area) => {
      const blueprint = AREA_BLUEPRINTS[area];
      const card = document.createElement("article");
      card.className = "blueprint-area-card";
      card.append(
        createTextElement("h3", "", blueprint.label),
        createTextElement("p", "", blueprint.description),
      );
      return card;
    });
  blueprintAreas.replaceChildren(...areaElements);

  const obstacleElements = [...selectedObstacles]
    .filter((obstacle) => OBSTACLE_LABELS[obstacle])
    .map((obstacle) =>
      createTextElement(
        "span",
        "blueprint-obstacle",
        OBSTACLE_LABELS[obstacle],
      ),
    );

  if (obstacleElements.length === 0) {
    obstacleElements.push(
      createTextElement("span", "blueprint-obstacle", "NONE SELECTED"),
    );
  }

  blueprintObstacles.replaceChildren(...obstacleElements);
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDailyStorageKey(name) {
  return `lock-in-${name}-${getDateKey()}`;
}

function getCommandArcState() {
  const arcState = calculateArcState(new Date());
  const day = Math.min(
    arcState.totalDays,
    Math.max(1, arcState.currentDay),
  );
  return { ...arcState, day };
}

function buildTodayMissions() {
  const context = {
    identities: selectedIdentities,
    areas: selectedAttentionAreas,
    obstacles: selectedObstacles,
  };
  const matchedMissions = MISSION_CATALOG.filter((mission) =>
    mission.matches(context),
  );
  const missions = [...matchedMissions];

  FALLBACK_MISSIONS.forEach((mission) => {
    if (missions.length < 3) {
      missions.push(mission);
    }
  });

  return missions.slice(0, 3);
}

function MissionCard(mission, completedMissions) {
  const card = document.createElement("article");
  const isComplete = completedMissions.has(mission.id);
  card.className = `mission-card${isComplete ? " mission-card--complete" : ""}`;

  const category = createTextElement(
    "p",
    "mission-card__category",
    mission.category,
  );
  const title = createTextElement("h3", "", mission.title);
  const description = createTextElement("p", "mission-card__copy", mission.description);
  const footer = document.createElement("footer");
  footer.className = "mission-card__footer";

  if (mission.target) {
    footer.append(
      createTextElement("span", "mission-card__target", mission.target),
    );
  }

  const completeButton = createTextElement(
    "button",
    "mission-complete",
    isComplete ? "COMPLETED" : "COMPLETE",
  );
  completeButton.type = "button";
  completeButton.setAttribute("aria-pressed", String(isComplete));
  completeButton.addEventListener("click", () => {
    const wasComplete = completedMissions.has(mission.id);

    if (wasComplete) {
      completedMissions.delete(mission.id);
    } else {
      completedMissions.add(mission.id);
    }

    storage.writeJson(
      getDailyStorageKey("completed-missions"),
      [...completedMissions],
    );
    eventApi.record(
      wasComplete
        ? EventTypes.MISSION_UNCOMPLETED
        : EventTypes.MISSION_COMPLETED,
      {
        missionId: mission.id,
        category: mission.category,
        title: mission.title,
      },
    );
    TodayMission();
  });

  footer.append(completeButton);
  card.append(category, title, description, footer);
  return card;
}

function TodayMission() {
  const missions = buildTodayMissions();
  const completedMissions = new Set(
    storage.readJson(getDailyStorageKey("completed-missions"), []),
  );
  missionList.replaceChildren(
    ...missions.map((mission) => MissionCard(mission, completedMissions)),
  );
}

function ArcProgress(arcState = getCommandArcState()) {
  const { day, totalDays } = arcState;
  const progress = (day / totalDays) * 100;

  commandArcDay.textContent = `DAY ${day} OF ${totalDays}`;
  progressDay.textContent = `DAY ${day} / ${totalDays}`;
  arcProgress.setAttribute("aria-valuenow", String(day));
  arcProgress.setAttribute("aria-valuemax", String(totalDays));
  arcProgressFill.style.width = `${progress}%`;
}

function MoodCheckIn() {
  const mood = storage.readText(getDailyStorageKey("mood"));

  moodButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === mood));
  });

  moodResponse.hidden = !MOOD_RESPONSES[mood];
  moodResponse.textContent = MOOD_RESPONSES[mood] ?? "";
}

function QuickView() {
  const bodyAreas = ["health-food", "fitness", "energy-recovery", "appearance"];
  const mindAreas = ["mind", "digital-life", "career"];
  const lifeAreas = ["social-life", "environment"];

  bodyState.textContent = bodyAreas.some((area) =>
    selectedAttentionAreas.has(area),
  )
    ? "BUILDING"
    : "STEADY";
  mindState.textContent = mindAreas.some((area) =>
    selectedAttentionAreas.has(area),
  )
    ? "FOCUSING"
    : "CLEAR";
  lifeState.textContent = lifeAreas.some((area) =>
    selectedAttentionAreas.has(area),
  )
    ? "RESETTING"
    : "ALIGNING";
}

function CommandCenter() {
  const name = storage.readText(NAME_STORAGE_KEY).trim();
  const arcState = getCommandArcState();
  commandGreeting.textContent = name ? `GOOD MORNING, ${name}.` : "GOOD MORNING.";
  TodayMission();
  ArcProgress(arcState);
  MoodCheckIn();
  QuickView();
  eventApi.record(EventTypes.COMMAND_CENTER_OPENED, {
    arcDay: arcState.day,
  });
}

let screenBeforeDebug = "landing-screen";
let observerDebugTimer = null;

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

async function renderObserverDebug(events) {
  let activeSession = null;

  try {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(
        LockInBrowserObserver.OBSERVER_STATE_KEY,
      );
      activeSession =
        result[LockInBrowserObserver.OBSERVER_STATE_KEY] ?? null;
    }
  } catch (error) {
    console.error("LOCK IN observer debug retrieval failed", error);
  }

  const domainTotals = LockInBrowserObserver.getBrowserTimeByDomain(
    events,
    new Date(),
  );
  const activeDuration = activeSession
    ? Math.max(0, Date.now() - new Date(activeSession.startTime).getTime())
    : 0;

  if (activeSession) {
    const activeDomain = domainTotals.find(
      ({ domain }) => domain === activeSession.domain,
    );
    if (activeDomain) {
      activeDomain.durationMs += activeDuration;
    } else {
      domainTotals.push({
        domain: activeSession.domain,
        durationMs: activeDuration,
      });
    }
    domainTotals.sort((first, second) => second.durationMs - first.durationMs);
  }

  const totalDuration = domainTotals.reduce(
    (total, domain) => total + domain.durationMs,
    0,
  );
  const isActive = Boolean(activeSession);

  observerStatus.textContent = isActive ? "ACTIVE" : "INACTIVE";
  observerStatusDot.parentElement.classList.toggle(
    "observer-status--active",
    isActive,
  );
  observerDomain.textContent = activeSession?.domain ?? "NONE";
  observerDuration.textContent = activeSession
    ? formatDuration(activeDuration)
    : "0s";
  observerTotal.textContent = formatDuration(totalDuration);
  observerDomains.replaceChildren(
    ...domainTotals.slice(0, 5).map(({ domain, durationMs }) => {
      const row = document.createElement("div");
      row.className = "observer-domain-row";
      row.append(
        createTextElement("span", "", domain),
        createTextElement("strong", "", formatDuration(durationMs)),
      );
      return row;
    }),
  );
}

function formatEventMetadata(event) {
  if (event.type === EventTypes.MOOD_SELECTED) {
    return `mood: ${event.metadata.mood}`;
  }

  if (
    event.type === EventTypes.MISSION_COMPLETED ||
    event.type === EventTypes.MISSION_UNCOMPLETED
  ) {
    return `${event.metadata.category} · ${event.metadata.title}`;
  }

  if (event.type === EventTypes.COMMAND_CENTER_OPENED) {
    return `day: ${event.metadata.arcDay}`;
  }

  if (event.type === EventTypes.BROWSER_SITE_SESSION) {
    return `${event.metadata.domain} · ${formatDuration(event.metadata.durationMs)}`;
  }

  if (event.type === EventTypes.ONBOARDING_COMPLETED) {
    const identities = event.metadata.identities?.join(", ") ?? "";
    const areas = event.metadata.attentionAreas?.join(", ") ?? "";
    return [identities, areas].filter(Boolean).join(" · ");
  }

  return "";
}

async function renderEventStream() {
  const events = (await eventApi.getEvents()).slice().reverse();
  await renderObserverDebug(events);

  if (events.length === 0) {
    eventList.replaceChildren(
      createTextElement("p", "event-list-empty", "NO EVENTS"),
    );
    return;
  }

  const eventElements = events.map((event) => {
    const item = document.createElement("article");
    const timestamp = document.createElement("time");
    const title = createTextElement("h2", "", event.type);
    const metadata = formatEventMetadata(event);

    timestamp.dateTime = event.timestamp;
    timestamp.textContent = new Date(event.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    item.append(timestamp, title);

    if (metadata) {
      item.append(createTextElement("p", "", metadata));
    }

    return item;
  });

  eventList.replaceChildren(...eventElements);
}

async function openEventDebug() {
  const activeScreen = [...screens].find((screen) => !screen.hidden);
  if (activeScreen?.id !== "event-debug-screen") {
    screenBeforeDebug = activeScreen?.id ?? screenBeforeDebug;
  }
  showScreen("event-debug-screen");
  await renderEventStream();
  clearInterval(observerDebugTimer);
  observerDebugTimer = setInterval(async () => {
    await renderObserverDebug(await eventApi.getEvents());
  }, 1000);
}

function closeEventDebug() {
  clearInterval(observerDebugTimer);
  observerDebugTimer = null;
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showScreen(screenBeforeDebug);
}

function showScreen(screenId) {
  screens.forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.hidden = !isActive;
    screen.classList.toggle("screen--active", isActive);
  });

  window.scrollTo(0, 0);
}

enterArcButton.addEventListener("click", () => {
  showScreen("identity-screen");
});

identityCards.forEach((card) => {
  card.addEventListener("click", () => {
    toggleSavedSelection(
      selectedIdentities,
      card.dataset.identity,
      IDENTITIES_STORAGE_KEY,
    );
    renderIdentitySelections();
  });
});

identityContinueButton.addEventListener("click", () => {
  if (selectedIdentities.size > 0) {
    showScreen("fixing-screen");
  }
});

attentionCards.forEach((card) => {
  card.addEventListener("click", () => {
    toggleSavedSelection(
      selectedAttentionAreas,
      card.dataset.area,
      ATTENTION_AREAS_STORAGE_KEY,
    );
    renderStartingPoint();
  });
});

obstacleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleSavedSelection(
      selectedObstacles,
      button.dataset.obstacle,
      OBSTACLES_STORAGE_KEY,
    );
    renderStartingPoint();
  });
});

startingContext.addEventListener("input", () => {
  storage.writeText(CONTEXT_STORAGE_KEY, startingContext.value);
});

fixingContinueButton.addEventListener("click", () => {
  if (selectedAttentionAreas.size > 0) {
    renderBlueprint();
    showScreen("blueprint-screen");
  }
});

startArcButton.addEventListener("click", () => {
  storage.writeJson(ONBOARDING_COMPLETE_STORAGE_KEY, true);
  eventApi.record(EventTypes.ONBOARDING_COMPLETED, {
    identities: [...selectedIdentities],
    attentionAreas: [...selectedAttentionAreas],
  });
  CommandCenter();
  showScreen("command-center-screen");
});

moodButtons.forEach((button) => {
  button.addEventListener("click", () => {
    storage.writeText(getDailyStorageKey("mood"), button.dataset.mood);
    eventApi.record(EventTypes.MOOD_SELECTED, {
      mood: MOOD_LABELS[button.dataset.mood],
    });
    MoodCheckIn();
  });
});

clearEventsButton.addEventListener("click", async () => {
  if (window.confirm("Clear all life events?")) {
    await eventApi.clearEvents();
    await renderEventStream();
  }
});

closeEventsButton.addEventListener("click", closeEventDebug);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "E") {
    event.preventDefault();
    openEventDebug();
  }
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#events") {
    openEventDebug();
  }
});

renderArcState();
renderIdentitySelections();
startingContext.value = storage.readText(CONTEXT_STORAGE_KEY);
renderStartingPoint();
renderBlueprint();

if (storage.readJson(ONBOARDING_COMPLETE_STORAGE_KEY, false)) {
  CommandCenter();
  showScreen("command-center-screen");
}

if (location.hash === "#events") {
  openEventDebug();
}

setInterval(renderArcState, 60 * 60 * 1000);
