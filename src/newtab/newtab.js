const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const ARC_START = Date.UTC(2026, 8, 7);
const ARC_END = Date.UTC(2026, 11, 31);
const IDENTITIES_STORAGE_KEY = "lock-in-identities";
const ATTENTION_AREAS_STORAGE_KEY = "lock-in-attention-areas";
const OBSTACLES_STORAGE_KEY = "lock-in-obstacles";
const ONBOARDING_COMPLETE_STORAGE_KEY = "lock-in-onboarding-complete";

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
const auditService = new LockInAudit.AuditService({
  eventStore,
  persistence: eventPersistence,
});

const IDENTITY_LABELS = {
  athlete: "Athlete",
  thinker: "Thinker",
  builder: "Builder",
  "glow-up": "Glow up",
  explorer: "Explorer",
  connected: "Connected",
};

const AREA_BLUEPRINTS = {
  "health-food": {
    label: "HEALTH & FOOD",
    description: "Meals, energy, and everyday care.",
  },
  fitness: {
    label: "FITNESS",
    description: "Movement, strength, and consistency.",
  },
  "energy-recovery": {
    label: "ENERGY & RECOVERY",
    description: "Rest, recovery, and sustainable energy.",
  },
  mind: {
    label: "MIND",
    description: "Focus, confidence, and mental clarity.",
  },
  career: {
    label: "CAREER",
    description: "Learning, building, and meaningful work.",
  },
  appearance: {
    label: "APPEARANCE",
    description: "Style, grooming, and self-expression.",
  },
  environment: {
    label: "ENVIRONMENT",
    description: "Home, organization, and surroundings.",
  },
  "social-life": {
    label: "SOCIAL & LIFE",
    description: "Friends, experiences, hobbies, and connection.",
  },
  "digital-life": {
    label: "DIGITAL LIFE",
    description: "Attention, screen time, and intentional use.",
  },
};

const OBSTACLE_LABELS = {
  "low-energy": "Low energy",
  consistency: "Hard to stay consistent",
  procrastination: "Delayed starts",
  distraction: "Pulled attention",
  "chaotic-schedule": "Changing schedule",
  priorities: "Unclear priorities",
  "fall-off": "Lost momentum",
  motivation: "Waiting for motivation",
  overwhelmed: "Plan feels too big",
  "not-sure": "Not sure yet",
};

const OBSTACLE_NUDGES = {
  "low-energy": "Keep the first step small enough for today's energy.",
  consistency: "Repeatable beats impressive. Start with the smallest version.",
  procrastination: "Reduce the start to two minutes.",
  distraction: "Close one competing tab before you begin.",
  "chaotic-schedule": "Choose one opening in the schedule you have today.",
  priorities: "Start with the highlighted mission. Ignore the rest for now.",
  "fall-off": "Restarting counts. Begin with one small action.",
  motivation: "You do not need to feel ready. Start for two minutes.",
  overwhelmed: "Shrink the plan to one visible next action.",
  "not-sure": "Pick one mission. Starting will give you more information.",
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
    description: "Take an intentional pause or recovery block.",
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
    title: "TAKE ONE SMALL STEP",
    description: "Do one small action you chose for yourself.",
  },
  {
    id: "close-day",
    category: "LIFE",
    title: "CLOSE THE LOOP",
    description: "Finish one open loop that has been taking up space.",
  },
];

const MOOD_RESPONSES = {
  low: "Thanks for being honest 💛 Choose the smallest useful step.",
  meh: "No perfect mood required. Two minutes can start momentum 🌱",
  good: "You have something to work with. Put it toward what matters ✨",
  "locked-in": "Use the spark, but keep the plan kind and sustainable 🔥",
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
const fixingContinueButton = document.querySelector("#fixing-continue");
const blueprintIdentities = document.querySelector("#blueprint-identities");
const blueprintAreas = document.querySelector("#blueprint-areas");
const blueprintObstacles = document.querySelector("#blueprint-obstacles");
const startArcButton = document.querySelector("#start-arc");
const commandArcDay = document.querySelector("#command-arc-day");
const commandGreeting = document.querySelector("#command-greeting");
const missionList = document.querySelector("#mission-list");
const missionProgressSummary = document.querySelector(
  "#mission-progress-summary",
);
const missionEncouragement = document.querySelector("#mission-encouragement");
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
const openAuditButton = document.querySelector("#open-audit");
const closeAuditButton = document.querySelector("#close-audit");
const auditPreviousButton = document.querySelector("#audit-previous");
const auditTodayButton = document.querySelector("#audit-today");
const auditNextButton = document.querySelector("#audit-next");
const refreshAuditButton = document.querySelector("#refresh-audit");
const auditDateLabel = document.querySelector("#audit-date-label");
const auditDateElement = document.querySelector("#audit-date");
const auditViewTitle = document.querySelector("#audit-view-title");
const auditEmpty = document.querySelector("#audit-empty");
const auditContent = document.querySelector("#audit-content");
const auditVerdict = document.querySelector("#audit-verdict");
const auditVerdictCopy = document.querySelector("#audit-verdict-copy");
const auditMissions = document.querySelector("#audit-missions");
const auditMood = document.querySelector("#audit-mood");
const auditBrowserTotal = document.querySelector("#audit-browser-total");
const auditFocus = document.querySelector("#audit-focus");
const auditAddMore = document.querySelector("#audit-add-more");
const auditMakeInteresting = document.querySelector("#audit-make-interesting");
const auditHighlights = document.querySelector("#audit-highlights");
const auditMisses = document.querySelector("#audit-misses");
const auditDomains = document.querySelector("#audit-domains");
const auditPatternList = document.querySelector("#audit-pattern-list");

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
    const daysUntilStart = 1 - currentDay;
    return `Starts in ${daysUntilStart} ${
      daysUntilStart === 1 ? "day" : "days"
    }`;
  }

  if (currentDay > totalDays) {
    return `Complete · ${totalDays} days`;
  }

  return `Day ${currentDay} of ${totalDays}`;
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

function toSentenceCase(value) {
  const text = String(value ?? "").toLowerCase();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
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
      createTextElement("span", "blueprint-obstacle", "None selected"),
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

function MissionCard(mission, completedMissions, isNextMission) {
  const card = document.createElement("article");
  const isComplete = completedMissions.has(mission.id);
  card.className = [
    "mission-card",
    isComplete ? "mission-card--complete" : "",
    isNextMission ? "mission-card--next" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const category = createTextElement(
    "p",
    "mission-card__category",
    toSentenceCase(mission.category),
  );
  const title = createTextElement("h3", "", toSentenceCase(mission.title));
  const description = createTextElement("p", "mission-card__copy", mission.description);
  const tinyStart = isNextMission
    ? createTextElement(
        "p",
        "mission-card__nudge",
        "🌱 Two-minute start: begin small. Continuing is optional.",
      )
    : null;
  const footer = document.createElement("footer");
  footer.className = "mission-card__footer";

  if (mission.target) {
    footer.append(
      createTextElement(
        "span",
        "mission-card__target",
        toSentenceCase(mission.target),
      ),
    );
  }

  const completeButton = createTextElement(
    "button",
    "mission-complete",
    isComplete ? "Completed ✓" : "Mark complete",
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
  card.append(category, title, description);
  if (tinyStart) {
    card.append(tinyStart);
  }
  card.append(footer);
  return card;
}

function TodayMission(missions = buildTodayMissions()) {
  const completedMissions = new Set(
    storage.readJson(getDailyStorageKey("completed-missions"), []),
  );
  const completedCount = missions.filter(({ id }) =>
    completedMissions.has(id),
  ).length;
  const nextMission = missions.find(({ id }) => !completedMissions.has(id));
  const obstacleNudge = [...selectedObstacles]
    .map((obstacle) => OBSTACLE_NUDGES[obstacle])
    .find(Boolean);

  missionProgressSummary.textContent = `${completedCount} of ${missions.length} complete`;
  const encouragement = [
    obstacleNudge ?? "Pick one. Make the first step tiny. Starting counts.",
    "Momentum is here 🌱 One real win beats a perfect plan.",
    "You're close ✨ Keep the next step small and clear.",
    "You followed through 🌟 Let that be enough for today.",
  ];
  missionEncouragement.textContent =
    encouragement[Math.min(completedCount, encouragement.length - 1)];

  missionList.replaceChildren(
    ...missions.map((mission) =>
      MissionCard(
        mission,
        completedMissions,
        mission.id === nextMission?.id,
      ),
    ),
  );
}

function ArcProgress(arcState = getCommandArcState()) {
  const { currentDay, day, totalDays } = arcState;

  if (currentDay < 1) {
    const daysUntilStart = 1 - currentDay;
    commandArcDay.textContent = `Starts in ${daysUntilStart} ${
      daysUntilStart === 1 ? "day" : "days"
    }`;
    progressDay.textContent = "Not started";
    arcProgress.setAttribute("aria-valuenow", "0");
    arcProgress.setAttribute("aria-valuemax", String(totalDays));
    arcProgressFill.style.width = "0%";
    return;
  }

  const progress = (day / totalDays) * 100;

  commandArcDay.textContent =
    currentDay > totalDays ? "Arc complete" : `Day ${day} of ${totalDays}`;
  progressDay.textContent = `Day ${day} / ${totalDays}`;
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

  function showSelectedDirection(element, areas) {
    const selected = areas.filter((area) => selectedAttentionAreas.has(area));
    const labels = selected.map((area) =>
      toSentenceCase(AREA_BLUEPRINTS[area].label),
    );
    element.textContent =
      labels.length > 1
        ? `${labels[0]} +${labels.length - 1}`
        : labels[0] ?? "Not selected";
    element.title = labels.join(", ");
  }

  showSelectedDirection(bodyState, bodyAreas);
  showSelectedDirection(mindState, mindAreas);
  showSelectedDirection(lifeState, lifeAreas);
}

function getTimeBasedGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) {
    return { text: "Sunrise mode", emoji: "🌅" };
  }
  if (hour >= 8 && hour < 12) {
    return { text: "Good morning", emoji: "☀️" };
  }
  if (hour >= 12 && hour < 17) {
    return { text: "Good afternoon", emoji: "🌤️" };
  }
  if (hour >= 17 && hour < 20) {
    return { text: "Sunset mode", emoji: "🌇" };
  }
  if (hour >= 20 && hour < 24) {
    return { text: "Good evening", emoji: "🌙" };
  }
  return { text: "Deep night", emoji: "🌌" };
}

function renderCommandGreeting(date = new Date()) {
  const greeting = getTimeBasedGreeting(date);
  commandGreeting.textContent = `${greeting.text} ${greeting.emoji}`;
}

function CommandCenter() {
  const arcState = getCommandArcState();
  const missions = buildTodayMissions();
  renderCommandGreeting();
  TodayMission(missions);
  ArcProgress(arcState);
  MoodCheckIn();
  QuickView();
  eventApi.record(EventTypes.COMMAND_CENTER_OPENED, {
    arcDay: arcState.day,
    plannedMissions: missions.map(({ id, category, title }) => ({
      missionId: id,
      category,
      title,
    })),
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

function formatAuditDuration(durationMs) {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  return `${minutes}m`;
}

function formatMood(mood) {
  if (!mood) {
    return "Not selected";
  }
  return mood
    .toLowerCase()
    .split(/[\s-]+/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function getVerdictCopy(verdict, { isToday, hasPartialData }) {
  switch (verdict) {
    case "STRONG":
      return {
        title: "🌟 You followed through",
        detail: "Most of your planned missions became real action.",
      };
    case "SOLID":
      return {
        title: "🌱 Good momentum",
        detail: "You moved the important parts of your day forward.",
      };
    case "MIXED":
      return {
        title: "🌤️ A mixed day",
        detail: "Some missions landed and some stayed open.",
      };
    case "NEEDS_ATTENTION":
      return {
        title: "💛 Room to simplify",
        detail: "One clear priority can make the next start easier.",
      };
    default:
      if (hasPartialData) {
        return {
          title: "🪴 A partial picture",
          detail: "Some activity was captured, but no missions were available.",
        };
      }
      if (!isToday) {
        return {
          title: "Not enough data for this day",
          detail: "LOCK IN did not capture enough activity to build a reflection.",
        };
      }
      return {
        title: "🪴 Your day is still unfolding",
        detail: "Check missions and mood as you go. The picture will get clearer.",
      };
  }
}

function getPatternCopy(pattern) {
  switch (pattern.type) {
    case "HIGH_DISTRACTION_TIME":
      return {
        title: `Long session on ${pattern.domain}`,
        detail: `${formatAuditDuration(pattern.durationMs)} tracked. Did that match your intention?`,
      };
    case "STRONG_MISSION_COMPLETION":
      return {
        title: "✨ Your plan turned into action",
        detail: "You completed at least 80% of your planned missions.",
      };
    case "LOW_MISSION_COMPLETION":
      return {
        title: "A lighter plan may feel better",
        detail: "Consider choosing fewer or clearer missions next time.",
      };
    case "NO_MISSION_ACTIVITY":
      return {
        title: "Missions stayed unchanged",
        detail: "A plan existed, but no completions were recorded.",
      };
    case "LIMITED_BROWSER_DATA":
      return {
        title: "The browser picture is still forming",
        detail: "No completed browser sessions were available. This does not mean you were inactive.",
      };
    default:
      return {
        title: "Something stood out",
        detail: "Details are not available for this pattern yet.",
      };
  }
}

function renderAuditList(container, items, marker, emptyCopy) {
  const rows = items.map((item) => {
    const row = document.createElement("p");
    row.append(
      createTextElement("span", "audit-list__marker", marker),
      createTextElement("span", "", item),
    );
    return row;
  });

  if (rows.length === 0) {
    rows.push(createTextElement("p", "audit-list__empty", emptyCopy));
  }
  container.replaceChildren(...rows);
}

let selectedAuditDate = new Date();

async function renderDailyAudit() {
  const audit = await auditService.generateDailyAudit(selectedAuditDate);
  const todayKey = getDateKey(new Date());
  const isToday = audit.date === todayKey;
  const isFuture = audit.date > todayKey;
  const hasNoFutureData =
    isFuture && audit.verdict === "INSUFFICIENT_DATA";
  const hasPartialData =
    audit.mood.selected !== null || audit.browser.totalObservedMs > 0;

  auditDateLabel.textContent = isToday ? "TODAY" : isFuture ? "UPCOMING" : "PAST DAY";
  auditViewTitle.textContent = isToday
    ? "TODAY'S REFLECTION"
    : isFuture
      ? "UPCOMING DAY"
      : "DAILY REFLECTION";
  auditDateElement.dateTime = audit.date;
  auditDateElement.textContent = selectedAuditDate
    .toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
  auditTodayButton.disabled = isToday;
  auditEmpty.hidden = !hasNoFutureData;
  auditContent.hidden = hasNoFutureData;

  if (hasNoFutureData) {
    return;
  }

  const verdictCopy = getVerdictCopy(audit.verdict, {
    isToday,
    hasPartialData,
  });
  auditVerdict.textContent = verdictCopy.title;
  auditVerdictCopy.textContent = verdictCopy.detail;
  auditMissions.textContent = `${audit.missions.completed} / ${audit.missions.total} completed`;
  auditMood.textContent = formatMood(audit.mood.selected);
  auditBrowserTotal.textContent = `${formatAuditDuration(
    audit.browser.totalObservedMs,
  )} tracked`;
  auditFocus.textContent = audit.guidance.focus;
  auditAddMore.textContent = audit.guidance.addMore;
  auditMakeInteresting.textContent = audit.guidance.makeItInteresting;

  renderAuditList(
    auditHighlights,
    audit.highlights,
    "✓",
    "Nothing to highlight yet.",
  );
  renderAuditList(
    auditMisses,
    audit.misses,
    "→",
    "Nothing pressing right now.",
  );

  const domainRows = audit.browser.topDomains.map(({ domain, durationMs }) => {
    const row = document.createElement("div");
    row.append(
      createTextElement("span", "", domain),
      createTextElement("strong", "", formatAuditDuration(durationMs)),
    );
    return row;
  });
  if (domainRows.length === 0) {
    domainRows.push(
      createTextElement("p", "audit-list__empty", "No browser time tracked."),
    );
  }
  auditDomains.replaceChildren(...domainRows);

  const visiblePatterns = audit.patterns.filter(
    ({ type }) =>
      !(audit.verdict === "STRONG" && type === "STRONG_MISSION_COMPLETION"),
  );
  const patternRows = visiblePatterns.map((pattern) => {
    const copy = getPatternCopy(pattern);
    const row = document.createElement("article");
    row.className = `audit-pattern audit-pattern--${pattern.severity}`;
    row.append(
      createTextElement("h3", "", copy.title),
      createTextElement("p", "", copy.detail),
    );
    return row;
  });
  if (patternRows.length === 0) {
    patternRows.push(
      createTextElement("p", "audit-list__empty", "Nothing unusual stood out."),
    );
  }
  auditPatternList.replaceChildren(...patternRows);
}

async function openDailyAudit() {
  selectedAuditDate = new Date();
  showScreen("daily-audit-screen");
  await renderDailyAudit();
}

function moveAuditDate(dayOffset) {
  selectedAuditDate.setDate(selectedAuditDate.getDate() + dayOffset);
  return renderDailyAudit();
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
    obstacles: [...selectedObstacles],
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
  if (window.confirm("Clear all stored events? This cannot be undone.")) {
    await eventApi.clearEvents();
    await renderEventStream();
  }
});

closeEventsButton.addEventListener("click", closeEventDebug);
openAuditButton.addEventListener("click", openDailyAudit);
closeAuditButton.addEventListener("click", () => {
  showScreen("command-center-screen");
});
auditPreviousButton.addEventListener("click", () => moveAuditDate(-1));
auditTodayButton.addEventListener("click", () => {
  selectedAuditDate = new Date();
  renderDailyAudit();
});
auditNextButton.addEventListener("click", () => moveAuditDate(1));
refreshAuditButton.addEventListener("click", async () => {
  refreshAuditButton.disabled = true;
  refreshAuditButton.textContent = "REFRESHING…";

  try {
    await renderDailyAudit();
    refreshAuditButton.textContent = "UPDATED";
  } finally {
    setTimeout(() => {
      refreshAuditButton.textContent = "REFRESH REFLECTION";
      refreshAuditButton.disabled = false;
    }, 900);
  }
});

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
