const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PERSONAL_CONFIG = LockInGoals.validatePersonalConfig(
  globalThis.LOCK_IN_PERSONAL_CONFIG ?? {
    schemaVersion: 1,
    displayName: "",
    milestones: [],
    attentionDomains: [],
  },
).config;
const ARC_CONFIG = PERSONAL_CONFIG.arc ?? {};
const ARC_START_DATE = LockInGoals.parseDate(ARC_CONFIG.start) ?? new Date(2026, 8, 7);
const ARC_END_DATE = LockInGoals.parseDate(ARC_CONFIG.end) ?? new Date(2026, 11, 31);
const ARC_START = Date.UTC(
  ARC_START_DATE.getFullYear(),
  ARC_START_DATE.getMonth(),
  ARC_START_DATE.getDate(),
);
const ARC_END = Date.UTC(
  ARC_END_DATE.getFullYear(),
  ARC_END_DATE.getMonth(),
  ARC_END_DATE.getDate(),
);
const IDENTITIES_STORAGE_KEY = "lock-in-identities";
const ATTENTION_AREAS_STORAGE_KEY = "lock-in-attention-areas";
const OBSTACLES_STORAGE_KEY = "lock-in-obstacles";
const ONBOARDING_COMPLETE_STORAGE_KEY = "lock-in-onboarding-complete";
const GOALS_STORAGE_KEY = "lock-in-goals-v1";
const BEHAVIORS_STORAGE_KEY = "lock-in-behaviors-v1";
const EXPERIMENTS_STORAGE_KEY = "lock-in-experiments-v1";
const MISSION_HISTORY_STORAGE_KEY = "lock-in-mission-history-v1";
const INSIGHT_STORAGE_KEY = "lock-in-coach-insight";
const THREAD_STORAGE_KEY = "lock-in-coach-thread";
const COACH_API_URL = "http://127.0.0.1:8787/api/coach";
const PLAN_API_URL = "http://127.0.0.1:8787/api/plan";
const ADAPT_API_URL = "http://127.0.0.1:8787/api/adapt";
const CHAT_API_URL = "http://127.0.0.1:8787/api/coach/chat";
const COACH_HEALTH_URL = "http://127.0.0.1:8787/health";
const COACH_LOADING_MESSAGE = "Reading today’s context…";
const ADAPTIVE_PLAN_STORAGE_NAME = "adaptive-plan";
const IDENTITY_CATALOG = LockInGoals.IDENTITY_CATALOG;

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
};

const privateStorage = {
  async read(key, fallback) {
    try {
      if (globalThis.chrome?.storage?.local) {
        const values = await chrome.storage.local.get(key);
        return values[key] ?? fallback;
      }
      return storage.readJson(key, fallback);
    } catch {
      return fallback;
    }
  },
  async write(key, value) {
    if (globalThis.chrome?.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
      return;
    }
    storage.writeJson(key, value);
  },
};

let activeGoals = [];
let activeBehaviors = [];
let experiments = [];
let missionHistory = [];
let coachInsight = null;
let coachThread = [];
let selectedAuditDate = new Date();
let focusMissionId = null;

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

const IDENTITY_LABELS = Object.fromEntries(
  Object.entries(IDENTITY_CATALOG).map(([id, identity]) => [id, identity.label]),
);

const AREA_BLUEPRINTS = {
  "health-food": { label: "HEALTH & FOOD", description: "Meals, energy, and everyday care." },
  fitness: { label: "FITNESS", description: "Movement, strength, and consistency." },
  "energy-recovery": { label: "ENERGY & RECOVERY", description: "Rest, recovery, and sustainable energy." },
  mind: { label: "MIND", description: "Focus, confidence, and mental clarity." },
  career: { label: "CAREER", description: "Learning, building, and meaningful work." },
  appearance: { label: "APPEARANCE", description: "Style, grooming, and self-expression." },
  environment: { label: "ENVIRONMENT", description: "Home, organization, and surroundings." },
  "social-life": { label: "SOCIAL & LIFE", description: "Friends, experiences, hobbies, and connection." },
  "digital-life": { label: "DIGITAL LIFE", description: "Attention, screen time, and intentional use." },
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

const daysRemainingElement = document.querySelector("#days-remaining");
const arcDayElement = document.querySelector("#arc-day");
const arcTitleElement = document.querySelector("#arc-title");
const arcDateRangeElement = document.querySelector("#arc-date-range");
const screens = document.querySelectorAll(".screen");
const appNav = document.querySelector("#app-nav");
const appNavLinks = [...document.querySelectorAll(".app-nav__links [data-nav]")];
const appNavTriggers = [...document.querySelectorAll("[data-nav]")];
const celebrateRoot = document.querySelector("#celebrate");
const celebrateBurst = document.querySelector(".celebrate__burst");
const celebrateMessage = document.querySelector("#celebrate-message");
const APP_SCREENS = new Set([
  "command-center-screen",
  "goals-screen",
  "arc-screen",
  "daily-audit-screen",
  "progress-screen",
]);
const SCREEN_HASH = {
  "landing-screen": "begin",
  "identity-screen": "identity",
  "fixing-screen": "focus",
  "blueprint-screen": "blueprint",
  "command-center-screen": "today",
  "goals-screen": "goals",
  "arc-screen": "arc",
  "daily-audit-screen": "audit",
  "progress-screen": "evidence",
};
const HASH_SCREEN = Object.fromEntries(
  Object.entries(SCREEN_HASH).map(([screenId, hash]) => [hash, screenId]),
);
HASH_SCREEN.progress = "progress-screen";
const ONBOARDING_SCREENS = new Set([
  "landing-screen",
  "identity-screen",
  "fixing-screen",
  "blueprint-screen",
]);

const enterArcButton = document.querySelector("#enter-arc");
const identityBackButton = document.querySelector("#identity-back");
const identityCards = [...document.querySelectorAll(".identity-card")];
const identityContinueButton = document.querySelector("#identity-continue");
const fixingBackButton = document.querySelector("#fixing-back");
const attentionCards = [...document.querySelectorAll(".attention-card")];
const obstacleButtons = [...document.querySelectorAll("[data-obstacle]")];
const detailsSection = document.querySelector("#details-section");
const fixingContinueButton = document.querySelector("#fixing-continue");
const blueprintIdentities = document.querySelector("#blueprint-identities");
const blueprintAreas = document.querySelector("#blueprint-areas");
const blueprintObstacles = document.querySelector("#blueprint-obstacles");
const blueprintBackButton = document.querySelector("#blueprint-back");
const startArcButton = document.querySelector("#start-arc");
const commandArcDay = document.querySelector("#command-arc-day");
const commandGreeting = document.querySelector("#command-greeting");
const todayFocusList = document.querySelector("#today-focus-list");
const startFocusButton = document.querySelector("#start-focus");
const todayTheme = document.querySelector("#today-theme");
const todayFollowThrough = document.querySelector("#today-follow-through");
const commandArcInline = document.querySelector("#command-arc-inline");
const focusMode = document.querySelector("#focus-mode");
const identityGoalGrid = document.querySelector("#identity-goal-grid");
const goalDetail = document.querySelector("#goal-detail");
const goalForm = document.querySelector("#goal-form");
const goalFormError = document.querySelector("#goal-form-error");
const goalReadiness = document.querySelector("#goal-readiness");
const eventList = document.querySelector("#event-list");
const clearEventsButton = document.querySelector("#clear-events");
const closeEventsButton = document.querySelector("#close-events");
const observerStatus = document.querySelector("#observer-status");
const observerStatusDot = document.querySelector("#observer-status-dot");
const observerDomain = document.querySelector("#observer-domain");
const observerDuration = document.querySelector("#observer-duration");
const observerTotal = document.querySelector("#observer-total");
const observerDomains = document.querySelector("#observer-domains");

function $(id) {
  return document.querySelector(`#${id}`);
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function displayName() {
  return PERSONAL_CONFIG.displayName || "";
}

function toUtcDate(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function calculateArcState(date) {
  const today = toUtcDate(date);
  const totalDays = Math.round((ARC_END - ARC_START) / MILLISECONDS_PER_DAY) + 1;
  const currentDay = Math.floor((today - ARC_START) / MILLISECONDS_PER_DAY) + 1;
  const daysRemaining = Math.max(0, Math.ceil((ARC_END - today) / MILLISECONDS_PER_DAY));
  return { currentDay, daysRemaining, totalDays };
}

function getArcDayLabel({ currentDay, totalDays }) {
  if (currentDay < 1) {
    const daysUntilStart = 1 - currentDay;
    return `Starts in ${daysUntilStart} ${daysUntilStart === 1 ? "day" : "days"}`;
  }
  if (currentDay > totalDays) return `Complete · ${totalDays} days`;
  return `Day ${currentDay} of ${totalDays}`;
}

function renderArcState() {
  const arcState = calculateArcState(new Date());
  daysRemainingElement.textContent = arcState.daysRemaining;
  arcDayElement.textContent = getArcDayLabel(arcState);
  if (ARC_CONFIG.name) arcTitleElement.textContent = ARC_CONFIG.name;
  arcDateRangeElement.textContent = `${ARC_START_DATE.toLocaleDateString([], {
    month: "long",
    day: "numeric",
  })} to ${ARC_END_DATE.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
  if (commandArcDay) commandArcDay.textContent = getArcDayLabel(arcState);
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
  privateStorage.write(storageKey, [...values]);
}

function renderIdentitySelections() {
  identityCards.forEach((card) => {
    const isSelected = selectedIdentities.has(card.dataset.identity);
    card.setAttribute("aria-pressed", String(isSelected));
    card.querySelector(".identity-card__mark").textContent = isSelected ? "✓" : "+";
  });
  identityContinueButton.disabled = selectedIdentities.size === 0;
}

function renderStartingPoint() {
  attentionCards.forEach((card) => {
    card.setAttribute("aria-pressed", String(selectedAttentionAreas.has(card.dataset.area)));
  });
  obstacleButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(selectedObstacles.has(button.dataset.obstacle)));
  });
  const hasAttentionArea = selectedAttentionAreas.size > 0;
  detailsSection.hidden = !hasAttentionArea;
  fixingContinueButton.disabled = !hasAttentionArea;
}

function toggleSavedSelection(values, value, storageKey) {
  if (values.has(value)) values.delete(value);
  else values.add(value);
  saveSet(storageKey, values);
}

function renderBlueprint() {
  blueprintIdentities.replaceChildren(
    ...[...selectedIdentities]
      .filter((identity) => IDENTITY_LABELS[identity])
      .map((identity) => createTextElement("span", "blueprint-identity", IDENTITY_LABELS[identity])),
  );
  blueprintAreas.replaceChildren(
    ...[...selectedAttentionAreas]
      .filter((area) => AREA_BLUEPRINTS[area])
      .map((area) => {
        const card = document.createElement("article");
        card.className = "blueprint-area-card";
        card.append(
          createTextElement("h3", "", AREA_BLUEPRINTS[area].label),
          createTextElement("p", "", AREA_BLUEPRINTS[area].description),
        );
        return card;
      }),
  );
  const obstacleElements = [...selectedObstacles]
    .filter((obstacle) => OBSTACLE_LABELS[obstacle])
    .map((obstacle) => createTextElement("span", "blueprint-obstacle", OBSTACLE_LABELS[obstacle]));
  if (!obstacleElements.length) {
    obstacleElements.push(createTextElement("span", "blueprint-obstacle", "None selected"));
  }
  blueprintObstacles.replaceChildren(...obstacleElements);
}

function getDateKey(date = new Date()) {
  return LockInGoals.formatDateKey(date);
}

function getDailyStorageKey(name, date = new Date()) {
  return `lock-in-${name}-${getDateKey(date)}`;
}

async function readDaily(name, fallback, date = new Date()) {
  return privateStorage.read(getDailyStorageKey(name, date), fallback);
}

async function writeDaily(name, value, date = new Date()) {
  await privateStorage.write(getDailyStorageKey(name, date), value);
}

function getTimeBasedGreeting(date = new Date()) {
  const hour = date.getHours();
  const name = displayName();
  const named = name ? `, ${name}` : "";
  if (hour < 5) return `Still up${named}`;
  if (hour < 12) return `Good morning${named}`;
  if (hour < 17) return `Good afternoon${named}`;
  if (hour < 21) return `Good evening${named}`;
  return `Good night${named}`;
}

function areaLabels() {
  return Object.fromEntries(
    Object.entries(AREA_BLUEPRINTS).map(([area, blueprint]) => [area, blueprint.label]),
  );
}

function goalForIdentity(identityId) {
  return activeGoals.find(
    (goal) => goal.identityId === identityId && goal.status === "active",
  );
}

function behaviorsForGoal(goalId) {
  return activeBehaviors.filter(
    (behavior) => behavior.goalId === goalId && behavior.status !== "archived",
  );
}

function formValue(id) {
  return ($(id)?.value ?? "").trim();
}

function goalFromForm(existingGoal = null) {
  const now = new Date().toISOString();
  const identityId = formValue("goal-identity") || existingGoal?.identityId || "builder";
  const current = Number(formValue("metric-current"));
  const target = Number(formValue("metric-target"));
  const unit = formValue("metric-unit");
  return LockInGoals.normalizeGoalRecord({
    id: existingGoal?.id ?? globalThis.crypto?.randomUUID?.() ?? `goal-${Date.now()}`,
    identityId,
    area: LockInGoals.areaFromIdentity(identityId),
    outcome: formValue("goal-outcome"),
    why: formValue("goal-why"),
    metric: unit
      ? {
          baseline: existingGoal?.metric?.baseline ?? (Number.isFinite(current) ? current : 0),
          current: Number.isFinite(current) ? current : 0,
          target: Number.isFinite(target) ? target : 0,
          unit,
        }
      : { baseline: 0, current: 0, target: 0, unit: "" },
    deadline: formValue("goal-deadline"),
    frequencyPerWeek: Number(formValue("goal-frequency") || 3),
    cue: {
      trigger: formValue("cue-trigger"),
      time: formValue("cue-time"),
      place: formValue("cue-place"),
    },
    actions: {
      minimum: formValue("action-minimum"),
      standard: formValue("action-standard"),
      stretch: existingGoal?.actions?.stretch || "",
    },
    obstacle: formValue("goal-obstacle"),
    recoveryPlan: formValue("goal-recovery"),
    status: existingGoal?.status ?? "active",
    timestamps: {
      createdAt: existingGoal?.timestamps?.createdAt ?? now,
      updatedAt: now,
    },
  });
}

function updateGoalReadiness() {
  if (!goalReadiness) return;
  const readiness = LockInGoals.calculateGoalReadiness(goalFromForm());
  goalReadiness.textContent = readiness.summary;
}

function fillGoalForm(goal) {
  const behavior = behaviorsForGoal(goal.id)[0];
  $("goal-id").value = goal.id;
  $("goal-identity").value = goal.identityId;
  $("goal-outcome").value = goal.outcome;
  $("goal-why").value = goal.why;
  $("goal-deadline").value = goal.deadline || "";
  $("metric-current").value = goal.metric?.unit ? goal.metric.current : "";
  $("metric-target").value = goal.metric?.unit ? goal.metric.target : "";
  $("metric-unit").value = goal.metric?.unit || "";
  $("action-standard").value = behavior?.standard || goal.actions.standard;
  $("action-minimum").value = behavior?.minimum || goal.actions.minimum;
  $("cue-trigger").value = behavior?.cue.trigger || goal.cue.trigger;
  $("cue-time").value = behavior?.cue.time || goal.cue.time;
  $("cue-place").value = behavior?.cue.place || goal.cue.place;
  $("goal-frequency").value = String(behavior?.schedule.daysPerWeek || goal.frequencyPerWeek || 3);
  $("goal-obstacle").value = behavior?.friction.obstacle || goal.obstacle;
  $("goal-recovery").value = behavior?.friction.recoveryPlan || goal.recoveryPlan;
  $("goal-detail-identity").textContent = IDENTITY_CATALOG[goal.identityId]?.label || goal.identityId;
  $("goal-detail-title").textContent = goal.outcome || "New goal";
  const consistency = LockInGoals.calculateWeeklyConsistency(
    missionHistory.filter((entry) => entry.goalId === goal.id),
    LockInGoals.startOfWeek(new Date()),
    new Date(),
  );
  $("goal-progress-copy").textContent = consistency.planned
    ? `${consistency.percent}% of planned opportunities this week. ${consistency.completed} of ${consistency.planned} happened.`
    : "No planned days yet. The first completed behavior becomes evidence.";
  updateGoalReadiness();
  goalDetail.hidden = false;
  goalDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openGoalForIdentity(identityId) {
  const existing = goalForIdentity(identityId);
  if (existing) {
    fillGoalForm(existing);
    return;
  }
  goalForm.reset();
  $("goal-id").value = "";
  $("goal-identity").value = identityId;
  $("goal-frequency").value = "3";
  $("goal-detail-identity").textContent = IDENTITY_CATALOG[identityId]?.label || identityId;
  $("goal-detail-title").textContent = "New goal";
  $("goal-progress-copy").textContent =
    "No planned days yet. The first completed behavior becomes evidence.";
  goalFormError.textContent = "";
  goalDetail.hidden = false;
  updateGoalReadiness();
  goalDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderIdentityPicker() {
  const grid = $("identity-picker-grid");
  if (!grid) return;
  grid.replaceChildren(
    ...Object.values(IDENTITY_CATALOG).map((meta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "identity-chip";
      button.dataset.identity = meta.id;
      button.setAttribute("aria-pressed", String(selectedIdentities.has(meta.id)));
      button.textContent = `${meta.icon} ${meta.label}`;
      button.addEventListener("click", () => {
        toggleSavedSelection(selectedIdentities, meta.id, IDENTITIES_STORAGE_KEY);
        renderIdentityPicker();
        renderIdentityGoals();
      });
      return button;
    }),
  );
}

function renderIdentityGoals() {
  renderIdentityPicker();
  const identities = [...selectedIdentities].filter((id) => IDENTITY_CATALOG[id]);
  const cards = identities.map((identityId) => {
    const meta = IDENTITY_CATALOG[identityId];
    const goal = goalForIdentity(identityId);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "identity-goal-card";
    const copy = document.createElement("div");
    copy.className = "identity-goal-card__copy";
    copy.append(
      createTextElement("small", "", meta.label.toUpperCase()),
      createTextElement("strong", "", goal?.outcome || "Add a goal"),
      createTextElement(
        "p",
        "",
        goal?.deadline
          ? `Target ${
              LockInGoals.parseDate(goal.deadline)?.toLocaleDateString([], {
                month: "short",
                day: "numeric",
              }) || goal.deadline
            }`
          : meta.aspiration,
      ),
    );
    card.append(
      createTextElement("span", "identity-goal-card__icon", meta.icon),
      copy,
      createTextElement("span", "identity-goal-card__open", goal ? "Open" : "Write"),
    );
    card.addEventListener("click", () => openGoalForIdentity(identityId));
    return card;
  });
  if (!cards.length) {
    identityGoalGrid.replaceChildren(
      createTextElement(
        "p",
        "goal-detail__hint",
        "Tap an identity above to start a card. One primary goal per identity.",
      ),
    );
    return;
  }
  identityGoalGrid.replaceChildren(...cards);
}

async function persistGoals() {
  await privateStorage.write(GOALS_STORAGE_KEY, activeGoals);
  await privateStorage.write(BEHAVIORS_STORAGE_KEY, activeBehaviors);
}

async function readAdaptivePlan(date = new Date()) {
  return readDaily(ADAPTIVE_PLAN_STORAGE_NAME, null, date);
}

function mapMission(mission, goal) {
  const behavior = behaviorsForGoal(mission.goalId || goal?.id)[0];
  return {
    id: mission.id,
    goalId: mission.goalId || goal?.id,
    identityId: goal?.identityId || mission.identityId,
    behaviorId: mission.behaviorId || behavior?.id,
    area: mission.area || goal?.area,
    category: AREA_BLUEPRINTS[goal?.area]?.label || mission.category || goal?.area,
    title: behavior?.standard || mission.action || goal?.actions?.standard || mission.title,
    description: behavior?.standard || mission.action || mission.description,
    minimumAction: behavior?.minimum || goal?.actions?.minimum,
    cue: behavior?.cue || goal?.cue,
    source: mission.source || "plan",
    experimentId: mission.experimentId,
    reason: mission.reason,
  };
}

function buildDefaultMissions() {
  const selected = LockInGoals.selectDailyMissions(
    activeGoals,
    missionHistory,
    PERSONAL_CONFIG.milestones ?? [],
    new Date(),
    3,
  ).map((mission) => {
    const goal = activeGoals.find((item) => item.id === mission.goalId);
    return mapMission(mission, goal);
  });
  const experimentActions = LockInExperiments.protocolActionsForDate(
    experiments,
    new Date(),
  ).map((action) => ({
    ...action,
    category: "EXPERIMENT",
    minimumAction: action.title,
  }));
  const milestone = (PERSONAL_CONFIG.milestones ?? [])
    .map((item, index) => {
      const days = LockInGoals.differenceInCalendarDays(item.date, new Date());
      if (days < 0 || days > 3) return null;
      return {
        id: `${getDateKey()}:milestone:${item.id || index}`,
        title: item.label,
        description: item.label,
        category: "MILESTONE",
        source: "milestone",
        milestoneTaskId: item.id,
      };
    })
    .find(Boolean);
  const merged = [...experimentActions];
  if (milestone) merged.push(milestone);
  selected.forEach((mission) => {
    if (!merged.some((item) => item.goalId && item.goalId === mission.goalId)) {
      merged.push(mission);
    }
  });
  return merged.slice(0, 3);
}

async function buildTodayMissions(date = new Date()) {
  const saved = await readAdaptivePlan(date);
  if (Array.isArray(saved?.missions) && saved.missions.length) {
    return saved.missions.slice(0, 3);
  }
  return buildDefaultMissions();
}

function followThroughCopy() {
  const result = LockInGoals.calculateFollowThrough(missionHistory, new Date());
  const days = result.days;
  return `${days} ${days === 1 ? "day" : "days"}`;
}

async function recentCheckinSignals(date = new Date()) {
  const start = LockInGoals.startOfDay(LockInGoals.addDays(date, -6));
  const events = await eventApi.getEventsBetween(start, LockInGoals.endOfDay(date));
  return {
    recentEnergy: events
      .filter((event) => event.type === EventTypes.ENERGY_CHECKIN)
      .map((event) => ({ score: event.metadata?.score })),
    recentSleep: events
      .filter((event) => event.type === EventTypes.SLEEP_CHECKIN)
      .map((event) => ({ hours: event.metadata?.hours })),
    fitness: events.filter((event) => event.type === EventTypes.FITNESS_CHECKIN),
    events,
  };
}

async function currentTheme(date = new Date()) {
  const misses = activeGoals.reduce(
    (highest, goal) =>
      Math.max(highest, LockInGoals.countConsecutiveMisses(missionHistory, goal.id, date)),
    0,
  );
  const { recentEnergy, recentSleep } = await recentCheckinSignals(date);
  return LockInGoals.deriveFocusTheme({
    consecutiveMisses: misses,
    activeExperiment: experiments.find((item) => item.status === "active") || null,
    recentEnergy,
    recentSleep,
  });
}

async function completedMissionIds(date = new Date()) {
  const saved = await readDaily("completed-missions", [], date);
  return new Set(Array.isArray(saved) ? saved : []);
}

async function renderToday() {
  const missions = await buildTodayMissions();
  const completed = await completedMissionIds();
  const arcState = calculateArcState(new Date());
  commandGreeting.textContent = getTimeBasedGreeting();
  todayTheme.textContent = await currentTheme();
  todayFollowThrough.textContent = followThroughCopy();
  commandArcInline.textContent = ` · ${getArcDayLabel(arcState)}`;
  if (!missions.length) {
    todayFocusList.replaceChildren(
      createTextElement("li", "", "Add a goal — today’s focus comes from your behaviors."),
    );
    startFocusButton.disabled = true;
  } else {
    startFocusButton.disabled = false;
    todayFocusList.replaceChildren(
      ...missions.map((mission, index) => {
        const item = document.createElement("li");
        if (completed.has(mission.id)) item.classList.add("is-complete");
        item.append(
          createTextElement("span", "focus-index", String(index + 1).padStart(2, "0")),
          createTextElement("span", "focus-copy", mission.title),
        );
        return item;
      }),
    );
  }
}

async function syncPlannedHistory(missions) {
  const today = getDateKey();
  const completed = await completedMissionIds();
  missions.forEach((mission) => {
    const exists = missionHistory.some(
      (entry) => entry.missionId === mission.id && entry.date === today,
    );
    if (!exists) {
      missionHistory.push({
        missionId: mission.id,
        goalId: mission.goalId,
        behaviorId: mission.behaviorId,
        identityId: mission.identityId,
        experimentId: mission.experimentId,
        area: mission.area,
        date: today,
        planned: true,
        completed: completed.has(mission.id),
      });
    }
  });
  await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
  await eventApi.record(EventTypes.COMMAND_CENTER_OPENED, {
    arcDay: calculateArcState(new Date()).currentDay,
    plannedMissions: missions.map(({ id, title, category }) => ({
      missionId: id,
      category,
      title,
    })),
  });
}

async function CommandCenter() {
  const missions = await buildTodayMissions();
  await syncPlannedHistory(missions);
  await renderToday();
}

function nextIncompleteMission(missions, completed) {
  return missions.find((mission) => !completed.has(mission.id)) || missions[0] || null;
}

async function openFocusMode() {
  const missions = await buildTodayMissions();
  const completed = await completedMissionIds();
  const mission = nextIncompleteMission(missions, completed);
  if (!mission) return;
  focusMissionId = mission.id;
  $("focus-identity").textContent = IDENTITY_CATALOG[mission.identityId]?.label || "Now";
  $("focus-title").textContent = mission.title;
  const cue = mission.cue;
  $("focus-cue").textContent = cue?.trigger
    ? `${cue.trigger}${cue.place ? ` · ${cue.place}` : ""}`
    : "Do this now.";
  $("focus-minimum").textContent = mission.minimumAction
    ? `Hard-day version: ${mission.minimumAction}`
    : "";
  $("focus-skip-wrap").hidden = true;
  $("focus-skip-reason").value = "";
  if ($("focus-skip-actions")) $("focus-skip-actions").hidden = true;
  if ($("focus-primary-actions")) $("focus-primary-actions").hidden = false;
  focusMode.hidden = false;
}

function closeFocusMode() {
  focusMode.hidden = true;
  focusMissionId = null;
}

async function completeMission(mission, { level = "standard", skipped = false, reason = "" } = {}) {
  const completed = await completedMissionIds();
  if (skipped) completed.delete(mission.id);
  else completed.add(mission.id);
  await writeDaily("completed-missions", [...completed]);
  await eventApi.record(
    skipped ? EventTypes.MISSION_UNCOMPLETED : EventTypes.MISSION_COMPLETED,
    {
      missionId: mission.id,
      goalId: mission.goalId,
      behaviorId: mission.behaviorId,
      level: skipped ? null : level,
      title: mission.title,
      reason,
    },
  );
  missionHistory = missionHistory.filter(
    (entry) => !(entry.missionId === mission.id && entry.date === getDateKey()),
  );
  missionHistory.push({
    missionId: mission.id,
    goalId: mission.goalId,
    behaviorId: mission.behaviorId,
    identityId: mission.identityId,
    date: getDateKey(),
    planned: true,
    completed: !skipped,
    level: skipped ? null : level,
    recovery: level === "minimum",
    reason,
  });
  await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
  if (!skipped) celebrate("That’s follow-through.", { burst: true });
  await renderToday();
}

async function collectCoachContext(date = new Date()) {
  const auditDates = Array.from({ length: LockInCoachContext.RECENT_WINDOW_DAYS }, (_, dayOffset) => {
    const auditDate = new Date(date);
    auditDate.setDate(auditDate.getDate() - dayOffset);
    return auditDate;
  });
  const start = new Date(auditDates.at(-1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const [recentEvents, audits] = await Promise.all([
    eventApi.getEventsBetween(start, end),
    Promise.all(auditDates.map((auditDate) => auditService.generateDailyAudit(auditDate))),
  ]);
  const completed = await completedMissionIds(date);
  const currentMissions = (await buildTodayMissions(date)).map((mission) => ({
    id: mission.id,
    goalId: mission.goalId,
    title: mission.title,
    completed: completed.has(mission.id),
  }));
  const windowStart = LockInGoals.formatDateKey(
    LockInGoals.addDays(date, 1 - LockInCoachContext.RECENT_WINDOW_DAYS),
  );
  const patterns = LockInPatterns.detectMultiDayPatterns({
    history: missionHistory,
    events: recentEvents,
    goals: activeGoals,
    asOf: date,
  });
  return LockInCoachContext.buildCoachContext({
    asOf: date.toISOString(),
    blueprint: {
      identities: [...selectedIdentities],
      attentionAreas: [...selectedAttentionAreas],
      obstacles: [...selectedObstacles],
      arc: {
        name: ARC_CONFIG.name ?? "",
        start: LockInGoals.formatDateKey(ARC_START_DATE),
        end: LockInGoals.formatDateKey(ARC_END_DATE),
      },
    },
    goals: activeGoals.filter(({ status }) => status === "active").slice(0, 10),
    todayAudit: audits[0],
    recentAudits: audits.slice(1),
    recentEvents,
    currentMissions,
    recentMissionOutcomes: missionHistory
      .filter((entry) => entry.date >= windowStart)
      .slice(-35),
    experiments,
    patterns,
    lastInsight: coachInsight,
    activeExperiment: experiments.find((item) => item.status === "active") || null,
  });
}

async function isCoachReachable() {
  try {
    const response = await fetch(COACH_HEALTH_URL, { method: "GET" });
    const body = await response.json().catch(() => ({}));
    return response.ok && body?.ok === true;
  } catch {
    return false;
  }
}

async function ensureCoachBackend(onStarting) {
  if (await isCoachReachable()) return;
  if (typeof onStarting === "function") onStarting();
  if (!globalThis.chrome?.runtime?.sendMessage) {
    throw new Error("Run npm run setup-coach once, reload LOCK IN, then try again.");
  }
  let result;
  try {
    result = await chrome.runtime.sendMessage({ type: "ENSURE_COACH_BACKEND" });
  } catch {
    throw new Error(
      "Reload LOCK IN on chrome://extensions after running npm run setup-coach, then try again.",
    );
  }
  if (result?.ok) return;
  if (!result || result?.code === "NATIVE_HOST_UNAVAILABLE") {
    throw new Error(
      "Run npm run setup-coach once in the LOCK IN folder, reload the extension, then try again.",
    );
  }
  throw new Error(result?.error || "Could not start the local coach.");
}

function noticingCopy(insight) {
  if (!insight) {
    return "When a few days of evidence exist, I’ll tell you what I’m noticing.";
  }
  return [insight.observation, insight.pattern, insight.encouragement]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function renderCoachInsight() {
  const noticing = $("coach-noticing");
  const offer = $("coach-offer");
  const fixIt = $("yes-fix-it");
  if (!noticing) return;
  noticing.textContent = noticingCopy(coachInsight);
  const pending = Boolean(coachInsight && coachInsight.status !== "applied");
  if (offer) offer.hidden = !pending;
  if (fixIt) fixIt.hidden = !pending;
}

function renderCoachThread() {
  const thread = $("coach-thread");
  if (!coachThread.length) {
    thread.replaceChildren(
      createTextElement(
        "p",
        "coach-message",
        "Use this when the plan feels wrong. Add context, push back, or ask for a sharper next move.",
      ),
    );
    return;
  }
  thread.replaceChildren(
    ...coachThread.map((message) =>
      createTextElement(
        "p",
        `coach-message${message.role === "user" ? " coach-message--user" : ""}`,
        message.text,
      ),
    ),
  );
}

async function refreshCoachInsight() {
  const loading = $("coach-loading");
  const error = $("coach-error");
  loading.hidden = false;
  error.hidden = true;
  try {
    await ensureCoachBackend(() => {
      loading.textContent = "Starting the coach…";
    });
    loading.textContent = COACH_LOADING_MESSAGE;
    const response = await fetch(COACH_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await collectCoachContext()),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The coach could not respond right now.");
    const coaching = result.coaching;
    coachInsight = {
      date: getDateKey(),
      status: "pending",
      ...coaching,
    };
    await privateStorage.write(INSIGHT_STORAGE_KEY, coachInsight);
    renderCoachInsight();
    await renderToday();
  } catch (caught) {
    error.textContent = coachOfflineCopy();
    error.hidden = false;
  } finally {
    loading.textContent = COACH_LOADING_MESSAGE;
    loading.hidden = true;
  }
}

async function applyAdaptation(proposal) {
  await ensureCoachBackend();
  const context = await collectCoachContext();
  context.lastInsight = { ...coachInsight, proposedAdaptation: proposal };
  const response = await fetch(ADAPT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The plan could not be adapted.");
  const tomorrow = LockInGoals.addDays(new Date(), 1);
  const missions = LockInPlanBuilder.applyAdaptationToPlan({
    proposed: result.plan?.missions || [],
    goals: activeGoals.filter(({ status }) => status === "active"),
    date: tomorrow,
    recentOutcomes: context.recentMissionOutcomes,
    preserved: [],
    areaLabels: areaLabels(),
    proposal,
  });
  if (proposal?.type === "shrink") {
    activeBehaviors = LockInGoals.applyBehaviorAdaptation(activeBehaviors, {
      changes: activeBehaviors.map((behavior) => ({
        behaviorId: behavior.id,
        standard: behavior.minimum || behavior.standard,
      })),
    });
    await persistGoals();
  }
  if (proposal?.type === "experiment") {
    const experiment = LockInExperiments.normalizeExperiment(
      {
        hypothesis: proposal.changes,
        startDate: getDateKey(),
        endDate: LockInGoals.formatDateKey(LockInGoals.addDays(new Date(), 6)),
        status: "active",
        protocol: [
          { title: proposal.changes, measureKey: "completion" },
          { title: "Record evening energy", measureKey: "energy", when: "18:00" },
        ],
      },
      new Date(),
    );
    experiments.push(experiment);
    await privateStorage.write(EXPERIMENTS_STORAGE_KEY, experiments);
    await eventApi.record(EventTypes.EXPERIMENT_STARTED, { experimentId: experiment.id });
  }
  await writeDaily(ADAPTIVE_PLAN_STORAGE_NAME, {
    missions,
    generatedAt: new Date().toISOString(),
    adaptedFrom: proposal?.type,
  }, tomorrow);
  await eventApi.record(EventTypes.PLAN_ADAPTED, {
    type: proposal?.type,
    changes: proposal?.changes,
    forDate: getDateKey(tomorrow),
  });
  if (coachInsight) {
    coachInsight = { ...coachInsight, status: "applied" };
    await privateStorage.write(INSIGHT_STORAGE_KEY, coachInsight);
  }
  celebrate("Tomorrow’s plan changed.", { burst: true });
}

async function sendCoachChat(text) {
  const message = { role: "user", text, asOf: new Date().toISOString() };
  coachThread = [...coachThread, message].slice(-12);
  const context = await collectCoachContext();
  context.messages = coachThread;
  await ensureCoachBackend();
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The coach could not reply.");
  coachThread = [...coachThread, { role: "coach", text: result.chat.reply, asOf: new Date().toISOString() }];
  await privateStorage.write(THREAD_STORAGE_KEY, coachThread);
  renderCoachThread();
}

function defaultAuditDate() {
  const date = new Date();
  if (date.getHours() < 18) date.setDate(date.getDate() - 1);
  return date;
}

async function renderDailyAudit() {
  const date = selectedAuditDate;
  const isToday = getDateKey(date) === getDateKey();
  $("audit-date-label").textContent = isToday ? "Today" : "Yesterday";
  $("audit-date").textContent = date.toLocaleDateString();
  $("audit-view-title").textContent = isToday ? "Today" : "Yesterday";
  const audit = await auditService.generateDailyAudit(date);
  const events = await eventApi.getEventsBetween(
    LockInGoals.startOfDay(date),
    LockInGoals.endOfDay(date),
  );
  const patterns = LockInPatterns.detectMultiDayPatterns({
    history: missionHistory,
    events,
    goals: activeGoals,
    asOf: date,
  });
  const usefulPattern = patterns.find((pattern) => pattern.type !== "INSUFFICIENT_PATTERN_DATA") || patterns[0];
  const empty = !audit.happened?.length && !audit.missed?.length && audit.missions.total === 0;
  $("audit-empty").hidden = !empty;
  $("audit-content").hidden = empty;
  const sleep = events.find((event) => event.type === EventTypes.SLEEP_CHECKIN);
  const energy = events.find((event) => event.type === EventTypes.ENERGY_CHECKIN);
  const fitness = events.find((event) => event.type === EventTypes.FITNESS_CHECKIN);
  $("sleep-hours").value = sleep?.metadata?.hours ?? "";
  $("energy-score").value = energy?.metadata?.score ?? "";
  $("energy-at").value = energy?.metadata?.at ?? "";
  $("fitness-activity").value = fitness?.metadata?.activity ?? "";
  $("fitness-minutes").value = fitness?.metadata?.durationMin ?? "";
  const dateKey = getDateKey(date);
  const completedTitles = missionHistory
    .filter((entry) => entry.date === dateKey && entry.completed)
    .map((entry) => {
      const goal = activeGoals.find((item) => item.id === entry.goalId);
      const behavior = behaviorsForGoal(entry.goalId)[0];
      return (
        behavior?.standard ||
        goal?.actions?.standard ||
        goal?.outcome ||
        String(entry.missionId || "").split(":").at(-1).replaceAll("-", " ")
      );
    });
  const happenedExtras = (audit.happened || []).filter((item) => item.evidence !== "missions");
  const happened = completedTitles.length
    ? [...completedTitles.map((label) => ({ label })), ...happenedExtras]
    : happenedExtras.length
      ? happenedExtras
      : (audit.happened?.length ? audit.happened : audit.highlights.map((label) => ({ label })));
  const missed = audit.missed?.length
    ? audit.missed
    : audit.misses.map((label) => ({ label }));
  $("audit-happened").replaceChildren(
    ...happened.map((item) => createTextElement("p", "", item.label || item)),
  );
  $("audit-misses").replaceChildren(
    ...(missed.length
      ? missed.map((item) => createTextElement("p", "", item.label || item))
      : [createTextElement("p", "", "Nothing important was left open.")]),
  );
  $("audit-kept-count").textContent = audit.missions.total
    ? `${audit.missions.completed}/${audit.missions.total}`
    : "0/0";
  $("audit-missed-count").textContent = String(missed.length);
  $("audit-signal-count").textContent =
    usefulPattern && usefulPattern.type !== "INSUFFICIENT_PATTERN_DATA" ? "Found" : "Learning";
  $("audit-verdict").textContent = audit.missions.total
    ? audit.missions.completed === audit.missions.total
      ? "You followed through."
      : "The day left a signal."
    : "What actually happened?";
  $("audit-verdict-copy").textContent =
    audit.missions.total
      ? `${audit.missions.completed}/${audit.missions.total} important actions.`
      : happened.length
        ? `${happened.length} things logged. No planned action score for this date.`
        : "A quiet day, or the plan never started.";
  if (usefulPattern?.type === "PLAN_UNREALISTIC") {
    const recovery = LockInGoals.buildLapseRecovery(
      activeGoals.find((goal) => goal.id === usefulPattern.goalId) || activeGoals[0] || {},
      { missedCount: usefulPattern.missedCount, date },
    );
    $("audit-pattern-copy").textContent = `${usefulPattern.copy} ${recovery.message}`;
  } else {
    $("audit-pattern-copy").textContent = usefulPattern?.copy || "Not enough days to say.";
  }
  $("audit-coach-copy").textContent =
    coachInsight?.proposedAdaptation?.reason ||
    coachInsight?.nextAction ||
    "Use Try this when the plan needs a small correction.";
  const finished = experiments.find(
    (experiment) =>
      experiment.status === "active" &&
      experiment.endDate &&
      experiment.endDate <= getDateKey(date),
  );
  const resultCard = $("experiment-result-card");
  if (finished) {
    const evaluated = LockInExperiments.evaluateExperiment(
      finished,
      missionHistory,
      [],
      date,
    );
    resultCard.hidden = false;
    $("experiment-result-copy").textContent =
      `${evaluated.conclusion} Completion: ${evaluated.result.completedDays}/${evaluated.result.plannedDays}.`;
    resultCard.dataset.experimentId = finished.id;
  } else {
    resultCard.hidden = true;
  }
}

async function saveCheckins() {
  const hours = Number($("sleep-hours").value);
  const energy = Number($("energy-score").value);
  const activity = $("fitness-activity").value.trim();
  const minutes = Number($("fitness-minutes").value);
  const stamped = new Date(selectedAuditDate);
  stamped.setHours(21, 0, 0, 0);
  const at = stamped.toISOString();
  if (Number.isFinite(hours) && hours > 0) {
    await eventApi.record(EventTypes.SLEEP_CHECKIN, { hours }, "manual", at);
  }
  if (Number.isFinite(energy) && energy >= 1) {
    await eventApi.record(
      EventTypes.ENERGY_CHECKIN,
      { score: energy, at: $("energy-at").value.trim() || "now" },
      "manual",
      at,
    );
    const active = experiments.find((item) => item.status === "active");
    if (active) {
      await eventApi.record(
        EventTypes.EXPERIMENT_MEASURE,
        {
          experimentId: active.id,
          key: "energy",
          value: energy,
        },
        "lock-in",
        at,
      );
    }
  }
  if (activity) {
    await eventApi.record(
      EventTypes.FITNESS_CHECKIN,
      { activity, durationMin: Number.isFinite(minutes) ? minutes : 0 },
      "manual",
      at,
    );
  }
  await renderDailyAudit();
  celebrate("Logged.", { burst: false });
}

async function renderArcScreen() {
  const state = calculateArcState(new Date());
  const totalDays = Math.max(1, state.totalDays || 116);
  const currentDay = Math.min(totalDays, Math.max(1, state.currentDay));
  const arcProgress = Math.min(100, Math.max(0, Math.round((currentDay / totalDays) * 100)));
  $("arc-overview-name").textContent = ARC_CONFIG.name || "Winter Arc";
  $("arc-overview-range").textContent = `${ARC_START_DATE.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} - ${ARC_END_DATE.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}`;
  $("arc-overview-day").textContent = `Day ${currentDay}`;
  $("arc-overview-copy").textContent =
    currentDay <= 7
      ? "You are still at the beginning. The win is proving that this version of you shows up."
      : "This is the long view: not vibes, not streaks, just evidence that your life is bending in the right direction.";
  $("arc-year-progress").style.width = `${arcProgress}%`;
  $("arc-year-copy").textContent = `${arcProgress}% through the arc. ${totalDays - currentDay} days left to make the rest of the year feel different.`;
  const identities = [...selectedIdentities].filter((id) => IDENTITY_CATALOG[id]);
  const rows = identities.map((identityId) => {
    const adherence = LockInGoals.calculateIdentityAdherence(
      missionHistory,
      activeGoals,
      identityId,
      ARC_START_DATE,
      new Date(),
    );
    const row = document.createElement("div");
    row.className = "arc-identity-row";
    const copy = document.createElement("div");
    copy.className = "arc-identity-copy";
    copy.append(
      createTextElement("strong", "", IDENTITY_CATALOG[identityId].label),
      createTextElement(
        "small",
        "",
        adherence.planned
          ? `${adherence.completed} of ${adherence.planned} promises kept`
          : "No planned actions yet",
      ),
    );
    const bar = document.createElement("div");
    bar.className = "arc-bar";
    bar.append(document.createElement("span"));
    bar.firstChild.style.width = `${adherence.percent}%`;
    row.append(copy, bar, createTextElement("span", "arc-percent", `${adherence.percent}%`));
    return { row, adherence, identityId };
  });
  $("arc-identity-bars").replaceChildren(
    ...(rows.length
      ? rows.map((item) => item.row)
      : [createTextElement("p", "arc-caption", "Choose identities and lock goals to start seeing proof here.")]),
  );
  const overall = rows.reduce(
    (sum, item) => {
      sum.completed += item.adherence.completed;
      sum.planned += item.adherence.planned;
      return sum;
    },
    { completed: 0, planned: 0 },
  );
  $("arc-consistency").textContent = overall.planned
    ? `${Math.round((overall.completed / overall.planned) * 100)}%`
    : "0%";
  const best = [...rows].sort((left, right) => right.adherence.percent - left.adherence.percent)[0];
  $("arc-transformation").textContent = best
    ? `Your ${IDENTITY_CATALOG[best.identityId].label} self is showing up.`
    : await currentTheme();
  $("arc-transformation-copy").textContent = best
    ? `${best.adherence.completed} of ${best.adherence.planned} planned ${IDENTITY_CATALOG[best.identityId].label} actions happened. Keep making that identity easier to repeat.`
    : "Evidence will appear here as you complete real behaviors.";
}

function weekdayTrendRows() {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels
    .map((label, day) => {
      const planned = missionHistory.filter((entry) => {
        if (!entry.planned) return false;
        const date = LockInGoals.parseDate(entry.date);
        return date && date.getDay() === day;
      });
      return {
        label,
        planned: planned.length,
        completed: planned.filter((entry) => entry.completed).length,
      };
    })
    .filter((row) => row.planned > 0);
}

async function renderProgress() {
  const start = LockInGoals.startOfDay(LockInGoals.addDays(new Date(), -13));
  const events = await eventApi.getEventsBetween(start, LockInGoals.endOfDay(new Date()));
  const patterns = LockInPatterns.detectMultiDayPatterns({
    history: missionHistory,
    events,
    goals: activeGoals,
    asOf: new Date(),
  });
  const lens = patterns.find((pattern) => pattern.type !== "INSUFFICIENT_PATTERN_DATA");
  $("progress-lens").textContent =
    lens?.copy || "This tab is for raw signals that help Audit make better decisions.";
  const sections = [];
  const add = (title, body) => {
    if (!body) return;
    const card = document.createElement("section");
    card.className = "progress-card surface-card";
    card.append(createTextElement("h2", "", title), createTextElement("p", "", body));
    sections.push(card);
  };
  const addCustom = (title, nodes) => {
    if (!nodes.length) return;
    const card = document.createElement("section");
    card.className = "progress-card surface-card";
    card.append(createTextElement("h2", "", title), ...nodes);
    sections.push(card);
  };

  activeGoals
    .filter((goal) => goal.status === "active")
    .forEach((goal) => {
      const consistency = LockInGoals.calculateWeeklyConsistency(
        missionHistory.filter((entry) => entry.goalId === goal.id),
        LockInGoals.startOfWeek(new Date()),
        new Date(),
      );
      if (!consistency.planned) return;
      add(
        IDENTITY_CATALOG[goal.identityId]?.label || goal.outcome,
        `${goal.outcome}. ${consistency.percent}% of planned opportunities this week (${consistency.completed} of ${consistency.planned}).`,
      );
    });

  const weekdays = weekdayTrendRows();
  if (weekdays.length) {
    addCustom(
      "Day patterns",
      weekdays.map((row) => {
        const percent = Math.round((row.completed / row.planned) * 100);
        const line = document.createElement("div");
        line.className = "weekday-row";
        const bar = document.createElement("div");
        bar.className = "arc-bar";
        bar.append(document.createElement("span"));
        bar.firstChild.style.width = `${percent}%`;
        line.append(
          createTextElement("span", "", row.label),
          bar,
          createTextElement("span", "", `${percent}%`),
        );
        return line;
      }),
    );
  }

  const completed = missionHistory.filter((entry) => entry.completed).slice(-6);
  if (completed.length) {
    add(
      "Recent proof",
      completed
        .map((entry) => {
          const title = entry.missionId.split(":").at(-1).replaceAll("-", " ");
          return `${entry.date} · ${title}`;
        })
        .join(" · "),
    );
  }

  const weekdayTotals = {};
  for (let offset = 0; offset < 7; offset += 1) {
    const date = LockInGoals.addDays(new Date(), -offset);
    LockInBrowserObserver.getBrowserTimeByDomain(events, date).forEach(({ domain, durationMs }) => {
      weekdayTotals[domain] = (weekdayTotals[domain] || 0) + durationMs;
    });
  }
  const attention = Object.entries(weekdayTotals)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  if (attention.length) {
    add(
      "Browser attention",
      `Last 7 days in the browser: ${attention
        .map(([domain, durationMs]) => `${domain} ${formatDuration(durationMs)}`)
        .join(" · ")}`,
    );
  }

  const fitness = events.filter((event) => event.type === EventTypes.FITNESS_CHECKIN);
  if (fitness.length) {
    const minutes = fitness.reduce(
      (sum, event) => sum + (Number(event.metadata?.durationMin) || 0),
      0,
    );
    add(
      "Fitness",
      `${fitness.length} check-ins · ${minutes} minutes. ${fitness
        .slice(-4)
        .map((event) => event.metadata?.activity || "session")
        .join(" · ")}`,
    );
  }

  if (experiments.length) {
    add(
      "Experiments",
      experiments.map((item) => `${item.hypothesis} (${item.status})`).join(" · "),
    );
  }

  const milestones = PERSONAL_CONFIG.milestones ?? [];
  if (milestones.length) {
    add(
      "Milestones",
      milestones.map((item) => `${item.label} · ${item.date}`).join(" · "),
    );
  }

  if (!sections.length) {
    add(
      "Waiting on evidence",
      "Complete a behavior, log a check-in, or let a few browser days accumulate. Sections appear only when they have something to show.",
    );
  }
  $("progress-sections").replaceChildren(...sections);
}

function formatDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

async function renderObserverDebug(events) {
  let activeSession = null;
  try {
    if (globalThis.chrome?.storage?.local) {
      const result = await chrome.storage.local.get(LockInBrowserObserver.OBSERVER_STATE_KEY);
      activeSession = result[LockInBrowserObserver.OBSERVER_STATE_KEY] ?? null;
    }
  } catch (error) {
    console.error("LOCK IN observer debug retrieval failed", error);
  }
  const todayEvents = LockInEvents.getTodayEvents(events);
  const domainTotals = LockInBrowserObserver.getBrowserTimeByDomain(todayEvents);
  const totalDuration = domainTotals.reduce((sum, item) => sum + item.durationMs, 0);
  const activeDuration = activeSession
    ? Math.max(0, Date.now() - new Date(activeSession.startTime).getTime())
    : 0;
  observerStatus.textContent = activeSession ? "Tracking" : "Idle";
  observerStatusDot.textContent = activeSession ? "●" : "○";
  observerDomain.textContent = activeSession?.domain ?? "NONE";
  observerDuration.textContent = activeSession ? formatDuration(activeDuration) : "0s";
  observerTotal.textContent = formatDuration(totalDuration);
  const domainRows = domainTotals.slice(0, 5).map(({ domain, durationMs }) => {
    const row = document.createElement("div");
    row.className = "observer-domain-row";
    row.append(createTextElement("span", "", domain), createTextElement("strong", "", formatDuration(durationMs)));
    return row;
  });
  observerDomains.replaceChildren(
    ...(domainRows.length ? domainRows : [createTextElement("p", "observer-domains-empty", "No domains tracked today.")]),
  );
}

async function renderEventStream() {
  const events = (await eventApi.getEvents()).slice().reverse();
  await renderObserverDebug(events);
  if (!events.length) {
    eventList.replaceChildren(createTextElement("p", "event-list-empty", "No events yet."));
    return;
  }
  eventList.replaceChildren(
    ...events.map((event) => {
      const item = document.createElement("article");
      const timestamp = document.createElement("time");
      timestamp.dateTime = event.timestamp;
      timestamp.textContent = new Date(event.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      item.append(
        timestamp,
        createTextElement("h3", "", event.type.replaceAll("_", " ").toLowerCase()),
      );
      return item;
    }),
  );
}

let screenBeforeDebug = "command-center-screen";
let observerDebugTimer = null;
let debugReturnFocus = null;

async function openEventDebug() {
  const activeScreen = [...screens].find((screen) => !screen.hidden);
  if (activeScreen?.id !== "event-debug-screen") {
    screenBeforeDebug = activeScreen?.id ?? screenBeforeDebug;
    debugReturnFocus = document.activeElement;
  }
  showScreen("event-debug-screen");
  await renderEventStream();
  closeEventsButton.focus();
  clearInterval(observerDebugTimer);
  observerDebugTimer = setInterval(async () => {
    await renderObserverDebug(await eventApi.getEvents());
  }, 1000);
}

function closeEventDebug() {
  clearInterval(observerDebugTimer);
  observerDebugTimer = null;
  const screenId = screenBeforeDebug || "command-center-screen";
  showScreen(screenId);
  const hash = SCREEN_HASH[screenId];
  history.replaceState({ screenId }, "", hash ? `#${hash}` : location.pathname);
  if (debugReturnFocus instanceof HTMLElement) debugReturnFocus.focus();
}

function showScreen(screenId) {
  let activeScreen = null;
  screens.forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.hidden = !isActive;
    if (isActive) activeScreen = screen;
  });
  if (activeScreen) activeScreen.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0 });
  celebrateRoot?.classList.remove("is-on");
  if (celebrateRoot) celebrateRoot.hidden = true;
  const inApp = APP_SCREENS.has(screenId);
  if (appNav) appNav.hidden = !inApp;
  document.body.classList.toggle("app-ready", inApp);
  appNavLinks.forEach((button) => {
    const current = button.dataset.nav === screenId;
    button.classList.toggle("is-current", current);
    if (current) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function screenFromHash(hash = location.hash) {
  const key = hash.replace(/^#/, "");
  if (key === "events") return "event-debug-screen";
  if (key === "review" || key === "week") return "daily-audit-screen";
  return HASH_SCREEN[key] || null;
}

function navigateTo(screenId, { replace = false } = {}) {
  showScreen(screenId);
  const hash = SCREEN_HASH[screenId];
  const url = hash ? `${location.pathname}${location.search}#${hash}` : `${location.pathname}${location.search}`;
  const state = { screenId };
  if (replace || history.state?.screenId === screenId) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
}

function celebrate(message, { burst = false } = {}) {
  if (!celebrateRoot || !celebrateMessage) return;
  celebrateMessage.textContent = message;
  if (celebrateBurst) {
    celebrateBurst.replaceChildren();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (burst && !reduceMotion) {
      for (let index = 0; index < 16; index += 1) {
        const bit = document.createElement("span");
        const angle = (index / 16) * Math.PI * 2;
        bit.style.setProperty("--tx", `${Math.cos(angle) * 90}px`);
        bit.style.setProperty("--ty", `${Math.sin(angle) * 90}px`);
        celebrateBurst.append(bit);
      }
    }
  }
  celebrateRoot.hidden = false;
  celebrateRoot.classList.add("is-on");
  window.clearTimeout(celebrate.timer);
  celebrate.timer = window.setTimeout(() => {
    celebrateRoot.classList.remove("is-on");
    celebrateRoot.hidden = true;
  }, 1500);
}

function isOnboarded() {
  return storage.readJson(ONBOARDING_COMPLETE_STORAGE_KEY, false);
}

async function loadAppScreen(screenId) {
  if (screenId === "goals-screen") renderIdentityGoals();
  if (screenId === "daily-audit-screen") {
    selectedAuditDate = defaultAuditDate();
    await renderDailyAudit();
  }
  if (screenId === "command-center-screen") await CommandCenter();
  if (screenId === "arc-screen") await renderArcScreen();
  if (screenId === "progress-screen") await renderProgress();
}

async function openAppScreen(screenId) {
  await loadAppScreen(screenId);
  navigateTo(screenId);
}

goalForm?.addEventListener("input", updateGoalReadiness);
goalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const existing = activeGoals.find((goal) => goal.id === $("goal-id").value);
  const identityId = formValue("goal-identity");
  if (!existing && goalForIdentity(identityId)) {
    goalFormError.textContent = "This identity already has a primary goal. Edit it instead.";
    return;
  }
  const draft = goalFromForm(existing);
  const validation = LockInGoals.validateGoalRecord(draft);
  if (!validation.valid) {
    goalFormError.textContent = validation.errors.join(" ");
    return;
  }
  const behaviors = LockInGoals.extractBehaviorsFromGoal(validation.value);
  if (existing) {
    activeGoals = activeGoals.map((goal) => (goal.id === existing.id ? validation.value : goal));
    activeBehaviors = [
      ...activeBehaviors.filter((behavior) => behavior.goalId !== existing.id),
      ...behaviors,
    ];
  } else {
    activeGoals.push(validation.value);
    activeBehaviors.push(...behaviors);
  }
  await persistGoals();
  await eventApi.record(existing ? EventTypes.GOAL_UPDATED : EventTypes.GOAL_CREATED, {
    goalId: validation.value.id,
    identityId: validation.value.identityId,
  });
  goalDetail.hidden = true;
  renderIdentityGoals();
  celebrate(existing ? "Goal updated." : "Goal locked in.", { burst: true });
});

$("cancel-goal")?.addEventListener("click", () => {
  goalDetail.hidden = true;
});
$("close-goal-detail")?.addEventListener("click", () => {
  goalDetail.hidden = true;
});
startFocusButton?.addEventListener("click", openFocusMode);
$("close-focus")?.addEventListener("click", closeFocusMode);
$("focus-done")?.addEventListener("click", async () => {
  const missions = await buildTodayMissions();
  const mission = missions.find((item) => item.id === focusMissionId);
  closeFocusMode();
  if (mission) await completeMission(mission);
});
$("focus-skip")?.addEventListener("click", () => {
  $("focus-skip-wrap").hidden = false;
  if ($("focus-skip-actions")) $("focus-skip-actions").hidden = false;
  if ($("focus-primary-actions")) $("focus-primary-actions").hidden = true;
});
async function skipCurrentFocus() {
  const reason = $("focus-skip-reason").value.trim();
  if (!reason) return;
  const missions = await buildTodayMissions();
  const mission = missions.find((item) => item.id === focusMissionId);
  if (mission) await completeMission(mission, { skipped: true, reason });
  closeFocusMode();
}
$("focus-skip-reason")?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  await skipCurrentFocus();
});
$("focus-skip-confirm")?.addEventListener("click", skipCurrentFocus);
$("save-checkins")?.addEventListener("click", saveCheckins);
$("audit-previous")?.addEventListener("click", () => {
  selectedAuditDate.setDate(selectedAuditDate.getDate() - 1);
  renderDailyAudit();
});
$("audit-next")?.addEventListener("click", () => {
  selectedAuditDate.setDate(selectedAuditDate.getDate() + 1);
  renderDailyAudit();
});
$("audit-today")?.addEventListener("click", () => {
  selectedAuditDate = new Date();
  renderDailyAudit();
});
$("refresh-audit")?.addEventListener("click", renderDailyAudit);
function coachOfflineCopy() {
  return "The local coach isn’t running. Try again once it is.";
}

$("try-this")?.addEventListener("click", async () => {
  const proposal = coachInsight?.proposedAdaptation || {
    type: "protect-slot",
    changes: "Move the hardest work to the first slot tomorrow.",
    reason: "Protect the slipping goal.",
  };
  const status = $("audit-adapt-status");
  if (status) {
    status.hidden = false;
    status.textContent = "Working on tomorrow…";
  }
  try {
    await applyAdaptation(proposal);
    if (status) status.textContent = "Tomorrow’s plan changed.";
  } catch {
    if (status) status.textContent = coachOfflineCopy();
  }
});
$("keep-experiment")?.addEventListener("click", async () => {
  const id = $("experiment-result-card").dataset.experimentId;
  experiments = experiments.map((item) =>
    item.id === id ? { ...item, status: "kept" } : item,
  );
  await privateStorage.write(EXPERIMENTS_STORAGE_KEY, experiments);
  await eventApi.record(EventTypes.EXPERIMENT_COMPLETED, { experimentId: id, kept: true });
  $("experiment-result-card").hidden = true;
  celebrate("Kept.", { burst: true });
});
$("discard-experiment")?.addEventListener("click", async () => {
  const id = $("experiment-result-card").dataset.experimentId;
  experiments = experiments.map((item) =>
    item.id === id ? { ...item, status: "discarded" } : item,
  );
  await privateStorage.write(EXPERIMENTS_STORAGE_KEY, experiments);
  await eventApi.record(EventTypes.EXPERIMENT_COMPLETED, { experimentId: id, kept: false });
  $("experiment-result-card").hidden = true;
});
$("yes-fix-it")?.addEventListener("click", async () => {
  try {
    await applyAdaptation(
      coachInsight?.proposedAdaptation || {
        type: "protect-slot",
        changes: "Protect the slipping behavior tomorrow morning.",
        reason: "The current evening plan is overloaded.",
      },
    );
    renderCoachInsight();
  } catch {
    $("coach-error").textContent = coachOfflineCopy();
    $("coach-error").hidden = false;
  }
});
$("refresh-insight")?.addEventListener("click", refreshCoachInsight);
$("coach-chat-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("coach-chat-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await sendCoachChat(text);
  } catch {
    $("coach-error").textContent = coachOfflineCopy();
    $("coach-error").hidden = false;
  }
});

enterArcButton.addEventListener("click", () => navigateTo("identity-screen"));
identityBackButton.addEventListener("click", () => navigateTo("landing-screen"));
identityCards.forEach((card) => {
  card.addEventListener("click", () => {
    toggleSavedSelection(selectedIdentities, card.dataset.identity, IDENTITIES_STORAGE_KEY);
    renderIdentitySelections();
  });
});
identityContinueButton.addEventListener("click", () => {
  if (selectedIdentities.size > 0) navigateTo("fixing-screen");
});
fixingBackButton.addEventListener("click", () => navigateTo("identity-screen"));
attentionCards.forEach((card) => {
  card.addEventListener("click", () => {
    toggleSavedSelection(selectedAttentionAreas, card.dataset.area, ATTENTION_AREAS_STORAGE_KEY);
    renderStartingPoint();
  });
});
obstacleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleSavedSelection(selectedObstacles, button.dataset.obstacle, OBSTACLES_STORAGE_KEY);
    renderStartingPoint();
  });
});
fixingContinueButton.addEventListener("click", () => {
  if (selectedAttentionAreas.size > 0) {
    renderBlueprint();
    navigateTo("blueprint-screen");
  }
});
blueprintBackButton.addEventListener("click", () => navigateTo("fixing-screen"));
startArcButton.addEventListener("click", async () => {
  storage.writeJson(ONBOARDING_COMPLETE_STORAGE_KEY, true);
  await privateStorage.write(ONBOARDING_COMPLETE_STORAGE_KEY, true);
  eventApi.record(EventTypes.ONBOARDING_COMPLETED, {
    identities: [...selectedIdentities],
    attentionAreas: [...selectedAttentionAreas],
    obstacles: [...selectedObstacles],
  });
  celebrate("You’re in.", { burst: true });
  if (activeGoals.length === 0) {
    renderIdentityGoals();
    navigateTo("goals-screen", { replace: true });
  } else {
    await CommandCenter();
    navigateTo("command-center-screen", { replace: true });
  }
});

clearEventsButton.addEventListener("click", async () => {
  if (window.confirm("Clear all stored events? This cannot be undone.")) {
    await eventApi.clearEvents();
    await renderEventStream();
  }
});
closeEventsButton.addEventListener("click", closeEventDebug);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#event-debug-screen").hidden) {
    event.preventDefault();
    closeEventDebug();
    return;
  }
  if (event.key === "Escape" && !focusMode.hidden) {
    closeFocusMode();
    return;
  }
  if (event.key === "Escape") {
    const activeScreen = [...screens].find((screen) => !screen.hidden);
    if (activeScreen && APP_SCREENS.has(activeScreen.id) && activeScreen.id !== "command-center-screen") {
      event.preventDefault();
      openAppScreen("command-center-screen");
    }
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === "E") {
    event.preventDefault();
    openEventDebug();
  }
});

appNavTriggers.forEach((button) => {
  button.addEventListener("click", () => openAppScreen(button.dataset.nav));
});

window.addEventListener("popstate", async (event) => {
  if (location.hash === "#events") return;
  let screenId = event.state?.screenId || screenFromHash() || "landing-screen";
  if (isOnboarded() && ONBOARDING_SCREENS.has(screenId)) {
    await loadAppScreen("command-center-screen");
    navigateTo("command-center-screen", { replace: true });
    return;
  }
  if (APP_SCREENS.has(screenId)) await loadAppScreen(screenId);
  if (screenId === "blueprint-screen") renderBlueprint();
  showScreen(screenId);
});

window.addEventListener("hashchange", () => {
  if (location.hash === "#events") openEventDebug();
});

async function initializeApp() {
  const [storedGoals, storedBehaviors, storedHistory, storedExperiments, storedInsight, storedThread] =
    await Promise.all([
      privateStorage.read(GOALS_STORAGE_KEY, []),
      privateStorage.read(BEHAVIORS_STORAGE_KEY, []),
      privateStorage.read(MISSION_HISTORY_STORAGE_KEY, []),
      privateStorage.read(EXPERIMENTS_STORAGE_KEY, []),
      privateStorage.read(INSIGHT_STORAGE_KEY, null),
      privateStorage.read(THREAD_STORAGE_KEY, []),
    ]);
  const migrated = LockInGoals.migrateGoalCollection(Array.isArray(storedGoals) ? storedGoals : []);
  activeGoals = migrated.goals;
  activeBehaviors = Array.isArray(storedBehaviors) && storedBehaviors.length
    ? storedBehaviors.map((behavior) => LockInGoals.normalizeBehaviorRecord(behavior))
    : migrated.behaviors;
  missionHistory = Array.isArray(storedHistory) ? storedHistory : [];
  experiments = Array.isArray(storedExperiments)
    ? storedExperiments.map((item) => LockInExperiments.normalizeExperiment(item))
    : [];
  coachInsight = storedInsight;
  coachThread = Array.isArray(storedThread) ? storedThread : [];
  await persistGoals();

  renderArcState();
  renderIdentitySelections();
  renderStartingPoint();
  renderBlueprint();

  if (location.hash === "#events") {
    if (isOnboarded()) {
      await CommandCenter();
      showScreen("command-center-screen");
    }
    openEventDebug();
    return;
  }

  const requested = screenFromHash();
  if (isOnboarded()) {
    const screenId = APP_SCREENS.has(requested) ? requested : "command-center-screen";
    await loadAppScreen(screenId);
    navigateTo(screenId, { replace: true });
  } else {
    const screenId = ONBOARDING_SCREENS.has(requested) ? requested : "landing-screen";
    navigateTo(screenId, { replace: true });
  }
}

initializeApp();
setInterval(renderArcState, 60 * 60 * 1000);
