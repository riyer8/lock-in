const PERSONAL_CONFIG = LockInGoals.validatePersonalConfig(
  globalThis.LOCK_IN_PERSONAL_CONFIG ?? {
    schemaVersion: 1,
    displayName: "",
    milestones: [],
    attentionDomains: [],
  },
).config;
const ARC_CONFIG = PERSONAL_CONFIG.arc ?? {};
const CONFIGURED_ARC_START =
  LockInGoals.parseDate(ARC_CONFIG.start) ?? new Date(2026, 8, 7);
const ARC_END_DATE = LockInGoals.parseDate(ARC_CONFIG.end) ?? new Date(2026, 11, 31);
let ARC_START_DATE = CONFIGURED_ARC_START;
const IDENTITIES_STORAGE_KEY = "lock-in-identities";
const ATTENTION_AREAS_STORAGE_KEY = "lock-in-attention-areas";
const OBSTACLES_STORAGE_KEY = "lock-in-obstacles";
const ONBOARDING_COMPLETE_STORAGE_KEY = "lock-in-onboarding-complete";
const GOALS_STORAGE_KEY = "lock-in-goals-v1";
const BEHAVIORS_STORAGE_KEY = "lock-in-behaviors-v1";
const EXPERIMENTS_STORAGE_KEY = "lock-in-experiments-v1";
const MISSION_HISTORY_STORAGE_KEY = "lock-in-mission-history-v1";
const ARC_START_OVERRIDE_KEY = "lock-in-arc-start";
const CUSTOM_TASKS_STORAGE_NAME = "custom-tasks";
const DAILIES_STORAGE_KEY = LockInDailies.DAILIES_STORAGE_KEY;
const DAILY_COMPLETIONS_STORAGE_NAME = LockInDailies.DAILY_COMPLETIONS_STORAGE_NAME;
const CUES_STORAGE_KEY = LockInCues.CUES_STORAGE_KEY;
const CUE_STATE_STORAGE_KEY = LockInCues.CUE_STATE_STORAGE_KEY;
const ADAPTIVE_PLAN_STORAGE_NAME = "adaptive-plan";
const IDENTITY_CATALOG = LockInGoals.IDENTITY_CATALOG;
const LIFE_AREAS = LockInGoals.LIFE_AREAS;

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
let selectedBrowserDateKey = null;
let focusMissionId = null;
let renderedTodayDateKey = getDateKey();
let selectedLifeAreaFilter = "all";
let allowCueMotion = false;

const eventPersistence = globalThis.chrome?.storage?.local
  ? new LockInEvents.ChromeStorageEventAdapter(chrome.storage.local)
  : new LockInEvents.LocalStorageEventAdapter(localStorage);
const eventStore = new LockInEvents.EventStore(eventPersistence);
const eventApi = new LockInEvents.EventApi(eventStore);
const { EventTypes } = LockInEvents;

const IDENTITY_LABELS = Object.fromEntries(
  Object.entries(IDENTITY_CATALOG).map(([id, identity]) => [id, identity.label]),
);

const AREA_BLUEPRINTS = {
  "health-food": { label: "HEALTH & FOOD", description: "Meals and energy." },
  fitness: { label: "FITNESS", description: "Movement and strength." },
  "energy-recovery": { label: "ENERGY & RECOVERY", description: "Rest that works." },
  mind: { label: "MIND", description: "Focus and clarity." },
  career: { label: "CAREER", description: "Learning and work." },
  appearance: { label: "APPEARANCE", description: "Style and grooming." },
  environment: { label: "ENVIRONMENT", description: "Home and order." },
  "social-life": { label: "SOCIAL & LIFE", description: "People and experiences." },
  "digital-life": { label: "DIGITAL LIFE", description: "Attention and screens." },
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
const celebrateRoot = document.querySelector("#celebrate");
const celebrateBurst = document.querySelector(".celebrate__burst");
const celebrateMessage = document.querySelector("#celebrate-message");
const APP_SCREENS = new Set([
  "command-center-screen",
  "goals-screen",
  "arc-screen",
]);
const SCREEN_HASH = {
  "landing-screen": "begin",
  "identity-screen": "identity",
  "fixing-screen": "focus",
  "blueprint-screen": "blueprint",
  "command-center-screen": "today",
  "goals-screen": "goals",
  "arc-screen": "arc",
};
const HASH_SCREEN = Object.fromEntries(
  Object.entries(SCREEN_HASH).map(([screenId, hash]) => [hash, screenId]),
);
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
const commandGreeting = document.querySelector("#command-greeting");
const todayDayPercent = document.querySelector("#today-day-percent");
const todayDayProgress = document.querySelector("#today-day-progress");
const todayDayCopy = document.querySelector("#today-day-copy");
const todayTaskForm = document.querySelector("#today-task-form");
const todayTaskInput = document.querySelector("#today-task-input");
const todayTaskList = document.querySelector("#today-task-list");
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

function applyArcStart(date) {
  ARC_START_DATE = LockInGoals.startOfDay(date) || CONFIGURED_ARC_START;
}

function calculateArcState(date = new Date()) {
  return LockInGoals.describeInclusiveArc({
    start: ARC_START_DATE,
    end: ARC_END_DATE,
    asOf: date,
  });
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
  if (hour < 5) return { emoji: "🌃", phrase: `Still up${named}` };
  if (hour < 12) return { emoji: "☀️", phrase: `Good morning${named}` };
  if (hour < 17) return { emoji: "🌤️", phrase: `Good afternoon${named}` };
  if (hour < 21) return { emoji: "🌇", phrase: `Good evening${named}` };
  return { emoji: "🌙", phrase: `Good night${named}` };
}

function renderGreeting(date = new Date()) {
  if (!commandGreeting) return;
  const { emoji, phrase } = getTimeBasedGreeting(date);
  const mark = createTextElement("span", "today-greeting-emoji", emoji);
  mark.setAttribute("aria-hidden", "true");
  commandGreeting.replaceChildren(mark, document.createTextNode(` ${phrase}`));
}

function areaLabels() {
  return Object.fromEntries(
    Object.entries(AREA_BLUEPRINTS).map(([area, blueprint]) => [area, blueprint.label]),
  );
}

function displayGoalTitle(goal) {
  return LockInGoals.goalTitle(goal) || "Untitled goal";
}

function cleanActionLabel(value) {
  const label = typeof value === "string" ? value.trim() : "";
  if (!label || /^untitled goal$/i.test(label)) return "";
  return label;
}

function missionActionLabel(entry, events = []) {
  const related = events.filter(
    (event) =>
      (event.type === EventTypes.MISSION_COMPLETED ||
        event.type === EventTypes.MISSION_UNCOMPLETED) &&
      event.metadata?.missionId === entry?.missionId,
  );
  const goal = entry?.goalId
    ? activeGoals.find((item) => item.id === entry.goalId)
    : null;
  const behavior =
    activeBehaviors.find((item) => item.id === entry?.behaviorId) ||
    (entry?.goalId ? behaviorsForGoal(entry.goalId)[0] : null);
  return (
    cleanActionLabel(related.at(-1)?.metadata?.title) ||
    cleanActionLabel(entry?.title) ||
    cleanActionLabel(behavior?.title) ||
    cleanActionLabel(behavior?.standard) ||
    cleanActionLabel(goal?.actions?.standard) ||
    cleanActionLabel(LockInGoals.goalTitle(goal))
  );
}

function livingGoals() {
  return activeGoals.filter(
    (goal) =>
      LockInGoals.ACTIVE_STATUSES.has(goal.status) ||
      goal.status === LockInGoals.PAUSED_STATUS,
  );
}

function goalForIdentity(identityId) {
  return livingGoals().find((goal) => goal.identityId === identityId);
}

function closedGoals() {
  return activeGoals.filter((goal) => LockInGoals.FINAL_STATUSES.has(goal.status));
}

function behaviorsForGoal(goalId, { includePaused = true, includeArchived = false } = {}) {
  return activeBehaviors.filter((behavior) => {
    if (behavior.goalId !== goalId) return false;
    if (behavior.status === "archived" && !includeArchived) return false;
    if (behavior.status === "paused" && !includePaused) return false;
    return true;
  });
}

function plannableBehaviorsForGoal(goalId) {
  return behaviorsForGoal(goalId, { includePaused: false }).filter((behavior) =>
    LockInGoals.isPlannableBehavior(behavior),
  );
}

function archivedBehaviorsForGoal(goalId) {
  return behaviorsForGoal(goalId, { includeArchived: true }).filter(
    (behavior) => behavior.status === "archived",
  );
}

function nextBehaviorId(goalId) {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `behavior-${goalId || "new"}-${Date.now()}`
  );
}

function createSelect(options, value) {
  const select = document.createElement("select");
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = String(option.value);
    item.textContent = option.label;
    select.append(item);
  });
  if (value !== undefined && value !== null && value !== "") {
    select.value = String(value);
  }
  return select;
}

function behaviorEventMeta(behavior) {
  return {
    behaviorId: behavior.id,
    goalId: behavior.goalId,
    title: LockInGoals.behaviorTitle(behavior),
    frequency: behavior.frequency,
    difficulty: behavior.difficulty,
    status: behavior.status,
  };
}

function behaviorFieldsChanged(before, after) {
  if (!before) return true;
  return (
    LockInGoals.behaviorTitle(before) !== LockInGoals.behaviorTitle(after) ||
    (before.description || "") !== (after.description || "") ||
    Number(before.frequency || 0) !== Number(after.frequency || 0) ||
    (before.difficulty || "medium") !== (after.difficulty || "medium")
  );
}

function behaviorEvidenceCopy(evidence) {
  if (evidence?.planned) {
    return evidence.lastCompletedAt
      ? `Fact: ${evidence.fact} Last kept ${evidence.lastCompletedAt}.`
      : `Fact: ${evidence.fact}`;
  }
  if (evidence?.lastCompletedAt) {
    return `Fact: last kept ${evidence.lastCompletedAt}. Not planned this week.`;
  }
  return "No evidence yet. Complete a mission that supports this behavior.";
}

function behaviorTodayCopy(missions) {
  if (!missions.length) return "Not on today's plan.";
  return `Today: ${missions.map((mission) => mission.title).join(" · ")}`;
}

function behaviorFromRow(row, goalId) {
  const existing = activeBehaviors.find((item) => item.id === row.dataset.behaviorId);
  const title = row.querySelector(".behavior-title")?.value.trim() || "";
  return LockInGoals.normalizeBehaviorRecord(
    {
      ...existing,
      id: row.dataset.behaviorId || nextBehaviorId(goalId),
      goalId: goalId || existing?.goalId,
      title,
      description: row.querySelector(".behavior-description")?.value.trim() || "",
      frequency: Number(row.querySelector(".behavior-frequency")?.value || existing?.frequency || 3),
      difficulty: row.querySelector(".behavior-difficulty")?.value || existing?.difficulty || "medium",
      status: row.dataset.status || existing?.status || "active",
      standard: title,
    },
    {},
    new Date(),
  );
}

async function removeBehaviorFromTodayPlan(behaviorId) {
  const saved = await readAdaptivePlan();
  if (!Array.isArray(saved?.missions) || !saved.missions.some((mission) => mission.behaviorId === behaviorId)) {
    return;
  }
  await writeDaily(ADAPTIVE_PLAN_STORAGE_NAME, {
    ...saved,
    missions: saved.missions.filter((mission) => mission.behaviorId !== behaviorId),
  });
}

async function upsertBehavior(behavior, eventType) {
  const record = LockInGoals.normalizeBehaviorRecord(behavior, {}, new Date());
  const exists = activeBehaviors.some((item) => item.id === record.id);
  activeBehaviors = exists
    ? activeBehaviors.map((item) => (item.id === record.id ? record : item))
    : [...activeBehaviors, record];
  await persistGoals();
  if (eventType) {
    await eventApi.record(eventType, behaviorEventMeta(record));
  }
  if (!LockInGoals.isPlannableBehavior(record)) {
    await removeBehaviorFromTodayPlan(record.id);
  }
  return record;
}

function canPersistBehaviors() {
  const goalId = formValue("goal-id");
  return Boolean(goalId && activeGoals.some((goal) => goal.id === goalId));
}

function updateBehaviorRowChrome(row, behavior) {
  row.dataset.behaviorId = behavior.id;
  row.dataset.status = behavior.status;
  row.classList.toggle("is-paused", behavior.status === "paused");
  const pause = row.querySelector("[data-behavior-action='pause']");
  if (pause) pause.textContent = behavior.status === "paused" ? "Resume" : "Pause";
}

async function decorateBehaviorRows(goalId) {
  const missions = goalId ? await buildTodayMissions() : [];
  [...document.querySelectorAll("#goal-behavior-list .behavior-card")].forEach((row) => {
    const id = row.dataset.behaviorId;
    const supporting = LockInGoals.missionsSupportingBehavior(missions, id);
    const source =
      activeBehaviors.find((item) => item.id === id) || behaviorFromRow(row, goalId);
    const evidence = LockInGoals.calculateBehaviorEvidence(source, missionHistory, new Date());
    const today = row.querySelector(".behavior-card__today");
    const copy = row.querySelector(".behavior-card__evidence");
    if (today) today.textContent = behaviorTodayCopy(supporting);
    if (copy) copy.textContent = behaviorEvidenceCopy(evidence);
  });
}

async function applyBehaviorRowStatus(row, status) {
  const goalId = formValue("goal-id");
  const draft = behaviorFromRow(row, goalId);
  const next = LockInGoals.setBehaviorStatus(draft, status, new Date());
  updateBehaviorRowChrome(row, next);
  if (canPersistBehaviors() && next.title) {
    const eventType =
      next.status === "paused"
        ? EventTypes.BEHAVIOR_PAUSED
        : next.status === "archived"
          ? EventTypes.BEHAVIOR_ARCHIVED
          : EventTypes.BEHAVIOR_UPDATED;
    await upsertBehavior(next, eventType);
  }
  if (next.status === "archived") {
    const list = $("goal-behavior-list");
    row.remove();
    if (list && !list.children.length) list.append(createBehaviorRow());
    await renderArchivedBehaviors(goalId);
  }
  updateGoalReadiness();
  await decorateBehaviorRows(goalId);
}

function createArchivedBehaviorRow(behavior) {
  const row = document.createElement("div");
  row.className = "archived-behavior-row";
  row.append(createTextElement("span", "", LockInGoals.behaviorTitle(behavior) || "Untitled behavior"));
  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "ghost-button";
  restore.textContent = "Restore";
  restore.addEventListener("click", async () => {
    const next = LockInGoals.setBehaviorStatus(behavior, "active", new Date());
    await upsertBehavior(next, EventTypes.BEHAVIOR_UPDATED);
    const list = $("goal-behavior-list");
    [...(list?.querySelectorAll(".behavior-card") || [])].forEach((row) => {
      if (!row.querySelector(".behavior-title")?.value.trim()) row.remove();
    });
    list?.append(createBehaviorRow(next));
    await renderArchivedBehaviors(behavior.goalId);
    updateGoalReadiness();
    await decorateBehaviorRows(behavior.goalId);
  });
  row.append(restore);
  return row;
}

async function renderArchivedBehaviors(goalId) {
  const section = $("goal-archived-behaviors");
  const list = $("goal-archived-behavior-list");
  if (!section || !list) return;
  const archived = goalId ? archivedBehaviorsForGoal(goalId) : [];
  section.hidden = archived.length === 0;
  list.replaceChildren(...archived.map(createArchivedBehaviorRow));
}

function createBehaviorRow(behavior = {}) {
  const record = LockInGoals.normalizeBehaviorRecord({
    ...behavior,
    id: behavior.id || nextBehaviorId(formValue("goal-id") || behavior.goalId),
    frequency: behavior.frequency || behavior.schedule?.daysPerWeek || 3,
    difficulty: behavior.difficulty || "medium",
    status: behavior.status || "active",
  });
  const row = document.createElement("article");
  row.className = "behavior-card goal-behavior-row";
  row.dataset.behaviorId = record.id;
  row.dataset.status = record.status || "active";
  if (record.status === "paused") row.classList.add("is-paused");

  const header = document.createElement("div");
  header.className = "behavior-card__header";
  const title = document.createElement("input");
  title.className = "behavior-title";
  title.maxLength = 140;
  title.placeholder = "Run 3x/week";
  title.value = LockInGoals.behaviorTitle(record);
  title.addEventListener("input", updateGoalReadiness);
  const actions = document.createElement("div");
  actions.className = "behavior-card__actions";
  const pause = document.createElement("button");
  pause.type = "button";
  pause.className = "text-button";
  pause.dataset.behaviorAction = "pause";
  pause.textContent = record.status === "paused" ? "Resume" : "Pause";
  pause.addEventListener("click", () => {
    const next = row.dataset.status === "paused" ? "active" : "paused";
    applyBehaviorRowStatus(row, next);
  });
  const archive = document.createElement("button");
  archive.type = "button";
  archive.className = "text-button danger-button";
  archive.textContent = "Archive";
  archive.addEventListener("click", () => {
    const label = title.value.trim() || "this behavior";
    const confirmed = window.confirm(`Archive “${label}”? It will leave Today.`);
    if (!confirmed) return;
    applyBehaviorRowStatus(row, "archived");
  });
  actions.append(pause, archive);
  header.append(title, actions);

  const description = document.createElement("textarea");
  description.className = "behavior-description";
  description.maxLength = 300;
  description.placeholder = "What this looks like in a normal week.";
  description.value = record.description || "";
  description.addEventListener("input", updateGoalReadiness);

  const meta = document.createElement("div");
  meta.className = "behavior-card__meta";
  const frequency = createSelect(
    [1, 2, 3, 4, 5, 6, 7].map((days) => ({
      value: days,
      label: days === 7 ? "Daily" : `${days}× / week`,
    })),
    record.frequency || 3,
  );
  frequency.className = "behavior-frequency";
  const difficulty = createSelect(
    [
      { value: "easy", label: "Easy" },
      { value: "medium", label: "Medium" },
      { value: "hard", label: "Hard" },
    ],
    record.difficulty || "medium",
  );
  difficulty.className = "behavior-difficulty";
  const frequencyLabel = document.createElement("label");
  frequencyLabel.append("Frequency", frequency);
  const difficultyLabel = document.createElement("label");
  difficultyLabel.append("Difficulty", difficulty);
  meta.append(frequencyLabel, difficultyLabel);

  row.append(
    header,
    description,
    meta,
    createTextElement("p", "behavior-card__today", "Save this goal to see today's missions."),
    createTextElement(
      "p",
      "behavior-card__evidence",
      "No evidence yet. Complete a mission that supports this behavior.",
    ),
  );
  return row;
}

function formValue(id) {
  return ($(id)?.value ?? "").trim();
}

function populateLifeAreaSelect(selectedId) {
  const select = $("goal-life-area");
  if (!select) return;
  const current = selectedId || select.value || LockInGoals.DEFAULT_LIFE_AREA;
  select.replaceChildren(
    ...LIFE_AREAS.map((area) => {
      const option = document.createElement("option");
      option.value = area.id;
      option.textContent = area.label;
      return option;
    }),
  );
  select.value = LIFE_AREAS.some((area) => area.id === current)
    ? current
    : LockInGoals.DEFAULT_LIFE_AREA;
}

function populateCategorySelect(selectedId) {
  const select = $("goal-category");
  if (!select) return;
  const current = selectedId || select.value;
  select.replaceChildren(
    ...Object.values(IDENTITY_CATALOG).map((meta) => {
      const option = document.createElement("option");
      option.value = meta.id;
      option.textContent = meta.label;
      return option;
    }),
  );
  select.value =
    current && IDENTITY_CATALOG[current]
      ? current
      : [...selectedIdentities][0] || "athlete";
}

function setBehaviorRows(behaviors) {
  const list = $("goal-behavior-list");
  if (!list) return;
  const rows = (Array.isArray(behaviors) ? behaviors : []).filter((item) =>
    LockInGoals.behaviorTitle(item),
  );
  list.replaceChildren(...(rows.length ? rows.map(createBehaviorRow) : [createBehaviorRow()]));
}

function behaviorsFromForm(goalId) {
  return [...document.querySelectorAll("#goal-behavior-list .behavior-card")]
    .map((row) => behaviorFromRow(row, goalId))
    .filter((behavior) => LockInGoals.behaviorTitle(behavior));
}

function goalFromForm(existingGoal = null) {
  const now = new Date().toISOString();
  const identityId =
    formValue("goal-category") ||
    formValue("goal-identity") ||
    existingGoal?.identityId ||
    "builder";
  const goalId =
    existingGoal?.id ||
    formValue("goal-id") ||
    globalThis.crypto?.randomUUID?.() ||
    `goal-${Date.now()}`;
  const title = formValue("goal-title");
  const outcome = formValue("goal-outcome") || title;
  const behaviors = behaviorsFromForm(goalId);
  return LockInGoals.normalizeGoalRecord({
    ...existingGoal,
    id: goalId,
    identityId,
    category: IDENTITY_CATALOG[identityId]?.label || identityId,
    area: existingGoal?.area || LockInGoals.areaFromIdentity(identityId),
    lifeArea: formValue("goal-life-area") || existingGoal?.lifeArea,
    title,
    outcome,
    why: formValue("goal-why"),
    targetDate: formValue("goal-deadline"),
    deadline: formValue("goal-deadline"),
    obstacles: formValue("goal-obstacle") ? [formValue("goal-obstacle")] : [],
    obstacle: formValue("goal-obstacle"),
    recoveryPlan: formValue("goal-recovery"),
    behaviors,
    frequencyPerWeek: behaviors[0]?.frequency || existingGoal?.frequencyPerWeek,
    actions: {
      minimum:
        existingGoal?.actions?.minimum ||
        LockInGoals.behaviorTitle(behaviors[0]) ||
        "",
      standard:
        LockInGoals.behaviorTitle(behaviors[0]) ||
        existingGoal?.actions?.standard ||
        "",
      stretch: existingGoal?.actions?.stretch || "",
    },
    status: existingGoal?.status ?? "active",
    timestamps: {
      createdAt: existingGoal?.timestamps?.createdAt ?? now,
      updatedAt: now,
    },
  });
}

function updateGoalReadiness() {
  if (!goalReadiness) return;
  const existing = activeGoals.find((goal) => goal.id === formValue("goal-id"));
  const readiness = LockInGoals.calculateGoalReadiness(goalFromForm(existing));
  goalReadiness.textContent = readiness.summary;
}

function closeGoalDetail() {
  if (goalDetail) goalDetail.hidden = true;
}

function setGoalEditorMode(existing) {
  const hasGoal = Boolean(existing);
  if ($("release-goal")) $("release-goal").hidden = !hasGoal;
  if ($("complete-goal")) $("complete-goal").hidden = !hasGoal;
  if ($("pause-goal")) {
    $("pause-goal").hidden = !hasGoal;
    $("pause-goal").textContent =
      existing?.status === LockInGoals.PAUSED_STATUS ? "Resume" : "Pause";
  }
}

function goalDeadlineCopy(goal) {
  const deadline = LockInGoals.parseDate(goal?.targetDate || goal?.deadline);
  if (!deadline) return "";
  const days = LockInGoals.differenceInCalendarDays(deadline, new Date());
  if (!Number.isFinite(days)) return goal.targetDate || goal.deadline;
  if (days < 0) return `${Math.abs(days)} days past target`;
  if (days === 0) return "Target is today";
  return `${days} days left`;
}

function goalCardMeta(goal) {
  const behaviors = behaviorsForGoal(goal.id)
    .map((behavior) => LockInGoals.behaviorTitle(behavior))
    .filter(Boolean)
    .slice(0, 3);
  return [goal.why, behaviors.join(" · "), goalDeadlineCopy(goal)].filter(Boolean).join(" · ");
}

function closedGoalStatusLabel(status) {
  if (status === "completed") return "Reached";
  if (status === "archived") return "Archived";
  if (status === LockInGoals.PAUSED_STATUS) return "Paused";
  return "Released";
}

async function setGoalLifecycle(goal, status) {
  const now = new Date().toISOString();
  const nextGoal = LockInGoals.setGoalStatus(goal, status, now);
  const isActive = LockInGoals.ACTIVE_STATUSES.has(nextGoal.status);
  activeGoals = activeGoals.map((item) => (item.id === goal.id ? nextGoal : item));
  if (LockInGoals.FINAL_STATUSES.has(nextGoal.status)) {
    activeBehaviors = activeBehaviors.map((behavior) =>
      behavior.goalId === goal.id && behavior.status !== "archived"
        ? LockInGoals.setBehaviorStatus(behavior, "archived", now)
        : behavior,
    );
  } else if (isActive && LockInGoals.FINAL_STATUSES.has(goal.status)) {
    activeBehaviors = activeBehaviors.map((behavior) =>
      behavior.goalId === goal.id && behavior.status === "archived"
        ? LockInGoals.setBehaviorStatus(behavior, "active", now)
        : behavior,
    );
  }
  await persistGoals();
  if (!isActive) {
    const saved = await readAdaptivePlan();
    if (Array.isArray(saved?.missions) && saved.missions.some((mission) => mission.goalId === goal.id)) {
      await writeDaily(ADAPTIVE_PLAN_STORAGE_NAME, {
        ...saved,
        missions: saved.missions.filter((mission) => mission.goalId !== goal.id),
      });
    }
  }
  const eventType =
    nextGoal.status === "completed"
      ? EventTypes.GOAL_COMPLETED
      : nextGoal.status === "archived" || nextGoal.status === "cancelled"
        ? EventTypes.GOAL_ARCHIVED
        : EventTypes.GOAL_UPDATED;
  await eventApi.record(eventType, {
    goalId: nextGoal.id,
    identityId: nextGoal.identityId,
    status: nextGoal.status,
  });
  return nextGoal;
}

async function confirmAndReleaseGoal(goal) {
  if (!goal) return false;
  const confirmed = window.confirm(
    `Archive “${displayGoalTitle(goal)}”? It will leave Today. You can restore it later.`,
  );
  if (!confirmed) return false;
  await setGoalLifecycle(goal, "archived");
  closeGoalDetail();
  await renderIdentityGoals();
  celebrate("Archived.");
  return true;
}

async function togglePauseGoal(goal) {
  if (!goal) return;
  const pausing = goal.status !== LockInGoals.PAUSED_STATUS;
  await setGoalLifecycle(goal, pausing ? LockInGoals.PAUSED_STATUS : "active");
  closeGoalDetail();
  await renderIdentityGoals();
  celebrate(pausing ? "Paused." : "Resumed.");
}

async function restoreGoal(goal) {
  selectedIdentities.add(goal.identityId);
  saveSet(IDENTITIES_STORAGE_KEY, selectedIdentities);
  await setGoalLifecycle(goal, "active");
  await renderIdentityGoals();
  celebrate("Restored.");
}

function renderReleasedGoals() {
  const section = $("released-goals");
  const list = $("released-goal-list");
  if (!section || !list) return;
  const closed = closedGoals();
  section.hidden = closed.length === 0;
  if (!closed.length) {
    list.replaceChildren();
    return;
  }
  list.replaceChildren(
    ...closed.map((goal) => {
      const row = document.createElement("div");
      row.className = "released-goal-row";
      const copy = document.createElement("div");
      copy.append(
        createTextElement("strong", "", displayGoalTitle(goal)),
        createTextElement(
          "small",
          "",
          `${LockInGoals.lifeAreaLabel(goal.lifeArea)} · ${closedGoalStatusLabel(goal.status)}`,
        ),
      );
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "ghost-button";
      restore.textContent = "Restore";
      restore.addEventListener("click", () => restoreGoal(goal));
      row.append(copy, restore);
      return row;
    }),
  );
}

async function renderGoalToday(goalId) {
  const list = $("goal-today-list");
  const copy = $("goal-today-copy");
  if (!list || !copy) return;
  if (!goalId) {
    copy.textContent = "Save this goal to see today's missions.";
    list.replaceChildren();
    return;
  }
  const missions = (await buildTodayMissions()).filter((mission) => mission.goalId === goalId);
  if (!missions.length) {
    copy.textContent =
      "No mission from this goal today. Today picks a few actions across your outcomes.";
    list.replaceChildren();
    return;
  }
  copy.textContent = "Today's missions that move this outcome.";
  list.replaceChildren(...missions.map((mission) => createTextElement("li", "", mission.title)));
}

async function fillGoalForm(goal) {
  const behaviors = behaviorsForGoal(goal.id);
  $("goal-id").value = goal.id;
  $("goal-identity").value = goal.identityId;
  populateCategorySelect(goal.identityId);
  populateLifeAreaSelect(goal.lifeArea);
  $("goal-title").value = displayGoalTitle(goal);
  $("goal-why").value = goal.why;
  $("goal-outcome").value = goal.outcome || "";
  $("goal-deadline").value = goal.targetDate || goal.deadline || "";
  setBehaviorRows(
    behaviors.length
      ? behaviors
      : [{ title: goal.actions?.standard, standard: goal.actions?.standard }],
  );
  $("goal-obstacle").value = goal.obstacles?.[0] || goal.obstacle || "";
  $("goal-recovery").value = goal.recoveryPlan || "";
  $("goal-detail-identity").textContent =
    goal.status === LockInGoals.PAUSED_STATUS
      ? "Paused"
      : goal.category || IDENTITY_CATALOG[goal.identityId]?.label || goal.identityId;
  const consistency = LockInGoals.calculateWeeklyConsistency(
    missionHistory.filter((entry) => entry.goalId === goal.id),
    LockInGoals.startOfWeek(new Date()),
    new Date(),
  );
  $("goal-progress-copy").textContent = consistency.planned
    ? `${consistency.percent}% kept this week. ${consistency.completed}/${consistency.planned} done.`
    : "No evidence yet. Complete a mission that moves this goal.";
  goalFormError.textContent = "";
  setGoalEditorMode(goal);
  updateGoalReadiness();
  goalDetail.hidden = false;
  await renderArchivedBehaviors(goal.id);
  await renderGoalToday(goal.id);
  await decorateBehaviorRows(goal.id);
  goalDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openNewGoal() {
  goalForm?.reset();
  $("goal-id").value = "";
  const identityId = [...selectedIdentities][0] || "athlete";
  $("goal-identity").value = identityId;
  populateCategorySelect(identityId);
  populateLifeAreaSelect(LockInGoals.DEFAULT_LIFE_AREA);
  $("goal-detail-identity").textContent = "New goal";
  setBehaviorRows([]);
  $("goal-progress-copy").textContent =
    "No evidence yet. Complete a mission that moves this goal.";
  $("goal-today-copy").textContent = "Save this goal to see today's missions.";
  $("goal-today-list")?.replaceChildren();
  goalFormError.textContent = "";
  setGoalEditorMode(null);
  updateGoalReadiness();
  renderArchivedBehaviors("");
  goalDetail.hidden = false;
  goalDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openGoalForIdentity(identityId) {
  const existing = goalForIdentity(identityId);
  if (existing) {
    fillGoalForm(existing);
    return;
  }
  openNewGoal();
  populateCategorySelect(identityId);
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
        if (selectedIdentities.has(meta.id)) selectedIdentities.delete(meta.id);
        else selectedIdentities.add(meta.id);
        saveSet(IDENTITIES_STORAGE_KEY, selectedIdentities);
        renderIdentityPicker();
      });
      return button;
    }),
  );
}

function renderLifeAreaFilter() {
  const row = $("life-area-filter");
  if (!row) return;
  const choices = [{ id: "all", label: "All" }, ...LIFE_AREAS];
  row.replaceChildren(
    ...choices.map((area) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "identity-chip";
      button.dataset.lifeArea = area.id;
      button.setAttribute("aria-pressed", String(selectedLifeAreaFilter === area.id));
      button.textContent = area.label;
      button.addEventListener("click", () => {
        selectedLifeAreaFilter = area.id;
        void renderIdentityGoals();
      });
      return button;
    }),
  );
}

function createGoalCard(goal, missions) {
  const meta = IDENTITY_CATALOG[goal.identityId];
  const todayMissions = missions.filter((mission) => mission.goalId === goal.id);
  const card = document.createElement("article");
  card.className = "identity-goal-card";
  if (goal.status === LockInGoals.PAUSED_STATUS) card.classList.add("is-paused");
  const open = document.createElement("button");
  open.type = "button";
  open.className = "identity-goal-card__main";
  const copy = document.createElement("div");
  copy.className = "identity-goal-card__copy";
  const statusLabel = goal.status === LockInGoals.PAUSED_STATUS ? "Paused" : "Active";
  copy.append(
    createTextElement(
      "small",
      "",
      `${LockInGoals.lifeAreaLabel(goal.lifeArea).toUpperCase()} · ${statusLabel}`,
    ),
    createTextElement("strong", "", displayGoalTitle(goal)),
    createTextElement("p", "", goalCardMeta(goal)),
  );
  if (todayMissions.length) {
    copy.append(
      createTextElement(
        "p",
        "goal-card-today",
        `Today: ${todayMissions.map((mission) => mission.title).join(" · ")}`,
      ),
    );
  }
  open.append(
    createTextElement("span", "identity-goal-card__icon", meta?.icon || "◎"),
    copy,
    createTextElement("span", "identity-goal-card__open", "Open"),
  );
  open.addEventListener("click", () => fillGoalForm(goal));
  const actions = document.createElement("div");
  actions.className = "identity-goal-card__actions";
  const pause = document.createElement("button");
  pause.type = "button";
  pause.className = "text-button identity-goal-card__release";
  pause.textContent = goal.status === LockInGoals.PAUSED_STATUS ? "Resume" : "Pause";
  pause.addEventListener("click", () => togglePauseGoal(goal));
  actions.append(pause);
  card.append(open, actions);
  return card;
}

function renderGoalAreaGroup(area, goals, missions) {
  const section = document.createElement("section");
  section.className = "goal-area-group";
  section.append(
    createTextElement("h2", "goal-area-group__title", area.label),
    ...goals.map((goal) => createGoalCard(goal, missions)),
  );
  return section;
}

async function renderIdentityGoals() {
  renderIdentityPicker();
  renderLifeAreaFilter();
  const missions = await buildTodayMissions();
  const goals = livingGoals();
  const filtered =
    selectedLifeAreaFilter === "all"
      ? goals
      : goals.filter((goal) => goal.lifeArea === selectedLifeAreaFilter);
  if (!identityGoalGrid) {
    renderReleasedGoals();
    return;
  }
  if (!goals.length) {
    identityGoalGrid.replaceChildren(
      createTextElement(
        "p",
        "goal-detail__hint",
        "Create a goal. Start with the outcome you want, then the behaviors that actually move it.",
      ),
    );
    renderReleasedGoals();
    return;
  }
  if (!filtered.length) {
    identityGoalGrid.replaceChildren(
      createTextElement(
        "p",
        "goal-detail__hint",
        `No goals in ${LockInGoals.lifeAreaLabel(selectedLifeAreaFilter)} yet.`,
      ),
    );
    renderReleasedGoals();
    return;
  }
  if (selectedLifeAreaFilter === "all") {
    identityGoalGrid.replaceChildren(
      ...LIFE_AREAS.flatMap((area) => {
        const group = filtered.filter((goal) => goal.lifeArea === area.id);
        return group.length ? [renderGoalAreaGroup(area, group, missions)] : [];
      }),
    );
  } else {
    const area = LIFE_AREAS.find((item) => item.id === selectedLifeAreaFilter);
    identityGoalGrid.replaceChildren(
      renderGoalAreaGroup(area || { label: LockInGoals.lifeAreaLabel(selectedLifeAreaFilter) }, filtered, missions),
    );
  }
  renderReleasedGoals();
}

async function persistGoals() {
  await privateStorage.write(GOALS_STORAGE_KEY, activeGoals);
  await privateStorage.write(BEHAVIORS_STORAGE_KEY, activeBehaviors);
}

async function readAdaptivePlan(date = new Date()) {
  return readDaily(ADAPTIVE_PLAN_STORAGE_NAME, null, date);
}

function mapMission(mission, goal) {
  const behavior =
    activeBehaviors.find((item) => item.id === mission.behaviorId) ||
    behaviorsForGoal(mission.goalId || goal?.id)[0];
  return {
    id: mission.id,
    goalId: mission.goalId || goal?.id,
    identityId: goal?.identityId || mission.identityId,
    behaviorId: mission.behaviorId || behavior?.id,
    area: mission.area || goal?.area,
    category:
      goal?.category ||
      AREA_BLUEPRINTS[goal?.area]?.label ||
      mission.category ||
      goal?.area,
    title:
      LockInGoals.behaviorTitle(behavior) ||
      mission.action ||
      goal?.actions?.standard ||
      mission.title,
    description:
      behavior?.description ||
      LockInGoals.behaviorTitle(behavior) ||
      mission.action ||
      mission.description,
    goalTitle: mission.goalTitle || goal?.title || goal?.outcome,
    minimumAction: behavior?.minimum || goal?.actions?.minimum,
    cue: behavior?.cue || goal?.cue,
    source: mission.source || "plan",
    experimentId: mission.experimentId,
    reason: mission.reason,
  };
}

function buildDefaultMissions(date = new Date()) {
  const difficulty = LockInPlanBuilder.choosePlanDifficulty(
    missionHistory.slice(-60),
  );
  const limit = LockInPlanBuilder.planSize(difficulty);
  const selected = LockInGoals.selectDailyMissions(
    activeGoals.map((goal) => ({
      ...goal,
      behaviors: plannableBehaviorsForGoal(goal.id),
    })),
    missionHistory,
    PERSONAL_CONFIG.milestones ?? [],
    date,
    limit,
  ).map((mission) => {
    const goal = activeGoals.find((item) => item.id === mission.goalId);
    return mapMission(mission, goal);
  });
  const experimentActions = LockInExperiments.protocolActionsForDate(
    experiments,
    date,
  ).map((action) => ({
    ...action,
    category: "EXPERIMENT",
    minimumAction: action.title,
  }));
  const milestone = (PERSONAL_CONFIG.milestones ?? [])
    .map((item, index) => {
      const days = LockInGoals.differenceInCalendarDays(item.date, date);
      if (days < 0 || days > 3) return null;
      return {
        id: `${getDateKey(date)}:milestone:${item.id || index}`,
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
  return merged.slice(0, limit);
}

async function buildTodayMissions(date = new Date()) {
  const missions = await buildTodayMissionsCore(date);
  if (getDateKey(date) !== getDateKey()) return missions;
  if (missions.some((mission) => mission?.source === "recovery")) return missions;
  const missedDays = await loadMissedDayKeys();
  const recovery = await buildRecoveryMission(missedDays);
  return recovery ? [recovery, ...missions] : missions;
}

async function buildTodayMissionsCore(date = new Date()) {
  const saved = await readAdaptivePlan(date);
  if (Array.isArray(saved?.missions) && saved.missions.length) {
    const kept = saved.missions.slice(0, 5).map((mission) => {
      const goal = activeGoals.find((item) => item.id === mission.goalId);
      if (goal && !LockInGoals.isPlannableGoal(goal)) return null;
      const behavior = mission.behaviorId
        ? activeBehaviors.find((item) => item.id === mission.behaviorId)
        : null;
      if (behavior && !LockInGoals.isPlannableBehavior(behavior)) return null;
      return {
        ...mission,
        goalTitle: mission.goalTitle || goal?.title || goal?.outcome,
        category: mission.category || goal?.category,
      };
    }).filter(Boolean);
    if (kept.length) return kept;
  }
  return buildDefaultMissions(date);
}

function followThroughCopy(missedDays) {
  const result = LockInGoals.calculateFollowThrough(missionHistory, new Date(), {
    missedDays,
  });
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

async function currentTheme(date = new Date(), missedDays = null) {
  const missed = missedDays ?? (await loadMissedDayKeys());
  const misses = activeGoals.reduce(
    (highest, goal) =>
      Math.max(
        highest,
        LockInGoals.countConsecutiveMisses(missionHistory, goal.id, date, {
          missedDays: missed,
        }),
      ),
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

function renderDayProgress(date = new Date()) {
  const { percent, fraction, remaining } = LockInClock.describeDayProgress(date);
  const ahead = 100 - percent;
  if (todayDayPercent) todayDayPercent.textContent = `${ahead}%`;
  if (todayDayProgress) todayDayProgress.style.strokeDasharray = `${fraction * 100} 100`;
  $("lockin-dial")?.style.setProperty("--day-turn", String(fraction));
  if (todayDayCopy) {
    todayDayCopy.replaceChildren(
      createTextElement("span", "lockin-daylight__label", "Today"),
      createTextElement("strong", "", `${ahead}%`),
      document.createTextNode(" still ahead · "),
      createTextElement("span", "lockin-daylight__left", remaining.replace(/ left$/, " to make it count")),
    );
  }
}

function renderYearCountdown(date = new Date()) {
  const { daysLeft, year, isLastDay } = LockInClock.describeYearCountdown(date);
  const days = $("lockin-days");
  const label = $("lockin-days-label");
  if (days) days.textContent = String(daysLeft);
  if (label) {
    label.textContent = isLastDay
      ? `last day of ${year}`
      : `days left in ${year}`;
  }
  const dateLabel = $("lockin-date");
  if (dateLabel) {
    dateLabel.textContent = date.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
}

function renderBrowserDomainRows(list, rows, emptyCopy) {
  if (!rows.length) {
    list.replaceChildren(createTextElement("li", "lockin-browser-empty", emptyCopy));
    return;
  }
  const topShare = rows[0].share || 1;
  list.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("li");
      if (row.isRest) item.classList.add("is-rest");
      const bar = document.createElement("span");
      bar.className = "lockin-browser-bar";
      bar.style.setProperty("--share", String(row.share / topShare));
      item.append(
        createTextElement("span", "lockin-browser-domain", row.domain),
        createTextElement("span", "lockin-browser-time", formatQuietDuration(row.durationMs)),
        bar,
      );
      return item;
    }),
  );
}

async function renderTodayBrowser(now = new Date()) {
  const list = $("lockin-browser-list");
  const week = $("lockin-browser-week");
  const total = $("lockin-browser-total");
  if (!list || !week || !total) return;
  const todayKey = getDateKey(now);
  const events = await eventApi.getEventsBetween(
    LockInGoals.startOfDay(LockInGoals.addDays(now, -6)),
    LockInGoals.endOfDay(now),
  );
  const days = LockInBrowserObserver.getBrowserDaySummaries(events, now, 7).reverse();
  if (!days.some((day) => day.dateKey === selectedBrowserDateKey)) selectedBrowserDateKey = null;
  const selectedKey = selectedBrowserDateKey || todayKey;
  const selectedDay = days.find((day) => day.dateKey === selectedKey);
  const isToday = selectedKey === todayKey;
  const dayName = isToday
    ? "today"
    : selectedKey === getDateKey(LockInGoals.addDays(now, -1))
      ? "yesterday"
      : `on ${LockInGoals.parseDate(selectedKey).toLocaleDateString([], { weekday: "long" })}`;
  const { totalMs, rows } = LockInClock.summarizeBrowserDomains(selectedDay?.domains, 8);
  total.textContent = totalMs
    ? `${formatQuietDuration(totalMs)} ${dayName}`
    : `Nothing ${dayName}`;
  renderBrowserDomainRows(
    list,
    rows,
    isToday
      ? "Time on sites shows up here after you leave a tab."
      : "No browser time recorded that day.",
  );
  $("lockin-browser-today")?.toggleAttribute("hidden", isToday);
  const maxMs = Math.max(...days.map((day) => day.totalMs), 1);
  week.replaceChildren(
    ...days.map((day) => {
      const parsed = LockInGoals.parseDate(day.dateKey);
      const weekday = parsed ? parsed.toLocaleDateString([], { weekday: "narrow" }) : "";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lockin-week__day";
      button.dataset.browserDay = day.dateKey;
      button.setAttribute("aria-pressed", String(day.dateKey === selectedKey));
      if (day.dateKey === todayKey) button.classList.add("is-today");
      button.style.setProperty("--height", String(day.totalMs / maxMs));
      const time = day.totalMs ? formatQuietDuration(day.totalMs) : "no time";
      button.title = `${parsed?.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" }) ?? day.dateKey}: ${time}`;
      button.setAttribute("aria-label", button.title);
      button.append(
        createTextElement("span", "lockin-week__time", day.totalMs ? formatQuietDuration(day.totalMs) : ""),
        createTextElement("span", "lockin-week__bar", ""),
        createTextElement("span", "lockin-week__label", weekday),
      );
      return button;
    }),
  );
}

function normalizeTodayTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .map((task) => ({
      id: String(task?.id || ""),
      title: String(task?.title || "").trim(),
      completed: Boolean(task?.completed),
      createdAt: String(task?.createdAt || new Date().toISOString()),
      completedAt: task?.completedAt ? String(task.completedAt) : null,
    }))
    .filter((task) => task.id && task.title)
    .slice(0, 12);
}

async function readTodayTasks(date = new Date()) {
  return normalizeTodayTasks(await readDaily(CUSTOM_TASKS_STORAGE_NAME, [], date));
}

async function writeTodayTasks(tasks, date = new Date()) {
  await writeDaily(CUSTOM_TASKS_STORAGE_NAME, normalizeTodayTasks(tasks), date);
}

function todayTaskElement(task) {
  const item = document.createElement("li");
  if (task.completed) item.classList.add("is-complete");
  const check = document.createElement("button");
  check.className = "today-task-check";
  check.type = "button";
  check.dataset.taskAction = "toggle";
  check.dataset.taskId = task.id;
  check.setAttribute("aria-label", task.completed ? "Mark task incomplete" : "Mark task complete");
  check.textContent = task.completed ? "✓" : "";
  const title = createTextElement("span", "today-task-title", task.title);
  const remove = document.createElement("button");
  remove.className = "today-task-delete";
  remove.type = "button";
  remove.dataset.taskAction = "delete";
  remove.dataset.taskId = task.id;
  remove.setAttribute("aria-label", `Delete ${task.title}`);
  remove.textContent = "×";
  item.append(check, title, remove);
  return item;
}

async function renderTodayTasks() {
  if (!todayTaskList) return;
  const tasks = await readTodayTasks();
  const heading = $("lockin-next");
  const next = tasks.find((task) => !task.completed);
  if (heading) {
    heading.textContent = !tasks.length
      ? "What has to happen today?"
      : next
        ? next.title
        : "All done. That counts.";
  }
  $("clear-today-tasks")?.toggleAttribute("hidden", !tasks.some((task) => task.completed));
  if (!tasks.length) {
    todayTaskList.replaceChildren(
      createTextElement("li", "today-task-empty", "Pick three things. The first one is your next move."),
    );
    return;
  }
  todayTaskList.replaceChildren(
    ...tasks.map((task) => {
      const item = todayTaskElement(task);
      if (task === next) item.classList.add("is-next");
      return item;
    }),
  );
}

async function loadDailies() {
  const stored = await privateStorage.read(DAILIES_STORAGE_KEY, []);
  return LockInDailies.normalizeDailyCollection(stored);
}

async function loadDailyCompletions(date = new Date()) {
  return LockInDailies.completionIds(await readDaily(DAILY_COMPLETIONS_STORAGE_NAME, [], date));
}

async function writeDailyCompletions(ids, date = new Date()) {
  await writeDaily(DAILY_COMPLETIONS_STORAGE_NAME, LockInDailies.completionIds(ids), date);
}

function dailyListItem(daily) {
  const item = document.createElement("li");
  if (daily.completedToday) item.classList.add("is-complete");
  const check = document.createElement("button");
  check.className = "today-task-check";
  check.type = "button";
  check.dataset.dailyAction = "toggle";
  check.dataset.dailyId = daily.id;
  check.setAttribute(
    "aria-label",
    daily.completedToday ? `Undo ${daily.title}` : `Mark ${daily.title} done for today`,
  );
  check.textContent = daily.completedToday ? "✓" : "";
  const title = createTextElement("span", "today-daily-title", daily.title);
  const remove = document.createElement("button");
  remove.className = "today-task-delete";
  remove.type = "button";
  remove.dataset.dailyAction = "delete";
  remove.dataset.dailyId = daily.id;
  remove.setAttribute("aria-label", `Remove ${daily.title} from every day`);
  remove.textContent = "×";
  item.append(check, title, remove);
  return item;
}

async function renderTodayDailies() {
  const list = $("today-daily-list");
  if (!list) return;
  const dailies = LockInDailies.withTodayState(await loadDailies(), await loadDailyCompletions());
  if (!dailies.length) {
    list.replaceChildren(
      createTextElement(
        "li",
        "today-daily-empty",
        "Repeats every day. Keep this quieter than focus.",
      ),
    );
    return;
  }
  list.replaceChildren(...dailies.map(dailyListItem));
}

async function renderToday() {
  const now = new Date();
  renderedTodayDateKey = getDateKey(now);
  renderGreeting(now);
  renderYearCountdown(now);
  renderDayProgress(now);
  await renderTodayTasks();
  await renderTodayDailies();
  await renderTodayBrowser(now);
  await renderCueRail();
}

async function tickTodayClock() {
  const now = new Date();
  renderDayProgress(now);
  renderGreeting(now);
  const currentDateKey = getDateKey(now);
  const todayVisible = !document.querySelector("#command-center-screen")?.hidden;
  if (todayVisible && currentDateKey !== renderedTodayDateKey) {
    await renderToday();
  } else if (todayVisible) {
    await renderTodayBrowser(now);
    await renderCueRail();
  } else if (document.body.classList.contains("app-ready")) {
    await renderCueRail();
  }
}

async function loadCues() {
  const stored = await privateStorage.read(CUES_STORAGE_KEY, null);
  if (stored == null) {
    const cues = LockInCues.normalizeCueCollection(null);
    await privateStorage.write(CUES_STORAGE_KEY, cues);
    return cues;
  }
  return LockInCues.normalizeCueCollection(stored);
}

async function loadCueState() {
  const stored = await privateStorage.read(CUE_STATE_STORAGE_KEY, {});
  const state = LockInCues.ensureInitialized(stored);
  if (!stored?.initializedAt) {
    await privateStorage.write(CUE_STATE_STORAGE_KEY, state);
  }
  return state;
}

function cueListItem(cue) {
  const item = document.createElement("li");
  if (!cue.enabled) item.classList.add("is-off");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "today-cue-toggle";
  toggle.dataset.cueAction = "toggle";
  toggle.dataset.cueId = cue.id;
  toggle.setAttribute("aria-pressed", cue.enabled ? "true" : "false");
  toggle.setAttribute("aria-label", cue.enabled ? `Pause ${cue.title}` : `Resume ${cue.title}`);
  toggle.textContent = cue.enabled ? "On" : "Off";
  const title = createTextElement("span", "today-cue-name", cue.title);
  const interval = document.createElement("div");
  interval.className = "today-cue-interval";
  const intervalInput = document.createElement("input");
  intervalInput.type = "number";
  intervalInput.min = String(LockInCues.MIN_INTERVAL_MINUTES);
  intervalInput.max = String(LockInCues.MAX_INTERVAL_MINUTES);
  intervalInput.value = String(cue.intervalMinutes);
  intervalInput.dataset.cueAction = "interval";
  intervalInput.dataset.cueId = cue.id;
  intervalInput.setAttribute("aria-label", `Repeat ${cue.title} every minutes`);
  interval.append(
    createTextElement("span", "", "every"),
    intervalInput,
    createTextElement("span", "", "min"),
  );
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "today-cue-delete";
  remove.dataset.cueAction = "delete";
  remove.dataset.cueId = cue.id;
  remove.setAttribute("aria-label", `Remove ${cue.title}`);
  remove.textContent = "×";
  item.append(toggle, title, interval, remove);
  return item;
}

async function renderCueList(cues) {
  const list = $("today-cue-list");
  if (!list) return;
  if (!cues.length) {
    list.replaceChildren(
      createTextElement("li", "today-task-empty", "Add a reminder if you want a quiet nudge."),
    );
    return;
  }
  list.replaceChildren(...cues.map(cueListItem));
}

let cueRenderQueue = Promise.resolve();

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hideCueCard(card) {
  if (!card || card.hidden) {
    card?.classList.remove("is-entering", "is-leaving");
    card?.removeAttribute("data-cue-id");
    return Promise.resolve();
  }
  if (prefersReducedMotion()) {
    card.hidden = true;
    card.classList.remove("is-entering", "is-leaving");
    card.removeAttribute("data-cue-id");
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      card.hidden = true;
      card.classList.remove("is-entering", "is-leaving");
      card.removeAttribute("data-cue-id");
      resolve();
    };
    card.classList.remove("is-entering");
    card.classList.add("is-leaving");
    card.addEventListener("animationend", (event) => {
      if (event.target === card) done();
    });
    window.setTimeout(done, 360);
  });
}

function showCueCard(card, cue) {
  const entering = card.hidden || card.dataset.cueId !== cue.id;
  card.hidden = false;
  card.dataset.cueId = cue.id;
  const title = $("today-cue-title");
  if (title) title.textContent = cue.title;
  if (!entering || prefersReducedMotion() || !allowCueMotion) {
    card.classList.remove("is-entering", "is-leaving");
    return;
  }
  card.classList.remove("is-leaving", "is-entering");
  void card.offsetWidth;
  card.classList.add("is-entering");
}

function renderCueRail() {
  cueRenderQueue = cueRenderQueue.then(
    () => syncCueRail(),
    () => syncCueRail(),
  );
  return cueRenderQueue;
}

async function syncCueRail() {
  const now = new Date();
  const rail = $("today-cue-rail");
  const card = $("today-cue-card");
  if (!rail || !card) return;
  const inApp = document.body.classList.contains("app-ready");
  if (!inApp) {
    rail.hidden = true;
    card.hidden = true;
    card.classList.remove("is-entering", "is-leaving");
    card.removeAttribute("data-cue-id");
    return;
  }
  rail.hidden = false;
  const cues = await loadCues();
  await renderCueList(cues);
  let state = await loadCueState();
  const due = LockInCues.chooseDueCue(cues, state, now);
  if (!due) {
    await hideCueCard(card);
    return;
  }
  const alreadyShown = state.pendingId === due.id && Boolean(state.lastById[due.id]?.lastShownAt);
  showCueCard(card, due);
  if (!alreadyShown) {
    state = LockInCues.markShown(state, due.id, now);
    await privateStorage.write(CUE_STATE_STORAGE_KEY, state);
    await eventApi.record(EventTypes.CUE_SHOWN, { cueId: due.id, title: due.title });
  }
}

async function dismissActiveCue() {
  const card = $("today-cue-card");
  const cueId = card?.dataset.cueId;
  if (!cueId) return;
  const cues = await loadCues();
  const cue = cues.find((item) => item.id === cueId);
  const state = await loadCueState();
  await privateStorage.write(
    CUE_STATE_STORAGE_KEY,
    LockInCues.markSnoozed(state, cueId),
  );
  await eventApi.record(EventTypes.CUE_SNOOZED, {
    cueId,
    title: cue?.title || "",
  });
  await renderCueRail();
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
        title: mission.title,
        date: today,
        planned: true,
        completed: completed.has(mission.id),
      });
    }
  });
  await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
  await eventApi.record(EventTypes.COMMAND_CENTER_OPENED, {
    arcDay: calculateArcState(new Date()).currentDay,
    plannedMissions: missions.map(({ id, title, category, goalId, behaviorId }) => ({
      missionId: id,
      goalId,
      behaviorId,
      category,
      title,
    })),
  });
}

function missedDayKeyFromEvent(event) {
  if (!event) return "";
  const fromMetadata =
    typeof event.metadata?.dateKey === "string" ? event.metadata.dateKey : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromMetadata)) return fromMetadata;
  return getDateKey(new Date(event.timestamp));
}

async function loadMissedDayKeys() {
  const today = LockInGoals.startOfDay(new Date());
  const start = LockInGoals.addDays(today, -120);
  const events = await eventApi.getEventsBetween(start, LockInGoals.endOfDay(today));
  const keys = new Set();
  events.forEach((event) => {
    if (event?.type !== EventTypes.DAY_MISSED) return;
    const key = missedDayKeyFromEvent(event);
    if (key) keys.add(key);
  });
  return keys;
}

function yesterdayMissed(missedDays) {
  const yesterday = LockInGoals.addDays(new Date(), -1);
  const key = getDateKey(yesterday);
  if (missedDays?.has(key)) return { key, date: yesterday };
  const entries = missionHistory.filter(
    (entry) => entry?.date === key && entry?.planned !== false,
  );
  if (entries.length && !entries.some((entry) => entry.completed || entry.recovery)) {
    return { key, date: yesterday };
  }
  return null;
}

async function buildRecoveryMission(missedDays) {
  const missed = yesterdayMissed(missedDays);
  const plannable = activeGoals.filter((goal) => LockInGoals.isPlannableGoal(goal));
  if (!missed || !plannable.length) return null;
  let bestGoal = null;
  let bestMisses = 0;
  plannable.forEach((goal) => {
    const misses = LockInGoals.countConsecutiveMisses(missionHistory, goal.id, new Date(), {
      missedDays,
    });
    if (misses > bestMisses) {
      bestMisses = misses;
      bestGoal = goal;
    }
  });
  const goal = bestGoal || plannable[0];
  if (!goal) return null;
  const todayKey = getDateKey();
  const recoveryId = `${todayKey}:recovery:${goal.id}`;
  if (
    missionHistory.some(
      (entry) => entry.missionId === recoveryId && entry.date === todayKey,
    )
  ) {
    return null;
  }
  const recovery = LockInGoals.buildLapseRecovery(goal, {
    missedCount: Math.max(1, bestMisses),
    date: missed.date,
  });
  const nextAction =
    recovery.nextAction || goal?.actions?.minimum || goal?.actions?.standard;
  if (!nextAction) return null;
  return {
    id: recoveryId,
    goalId: goal.id,
    identityId: goal.identityId,
    area: goal.area,
    category: "RECOVERY",
    title: nextAction,
    description: recovery.message,
    goalTitle: goal.title || goal.outcome,
    minimumAction: nextAction,
    reason: "Minimum step to restart after a missed day.",
    source: "recovery",
  };
}

async function backfillMissedDays() {
  if (!isOnboarded()) return;
  const today = LockInGoals.startOfDay(new Date());
  const arcStart = ARC_START_DATE;
  if (!today || !arcStart || arcStart >= today) return;
  const yesterday = LockInGoals.addDays(today, -1);
  const events = await eventApi.getEventsBetween(
    new Date(0),
    LockInGoals.endOfDay(yesterday),
  );
  let firstDay = arcStart;
  const onboarding = events.find(
    (event) => event.type === EventTypes.ONBOARDING_COMPLETED,
  );
  if (onboarding?.timestamp) {
    const onboardDay = LockInGoals.startOfDay(new Date(onboarding.timestamp));
    if (onboardDay && onboardDay > firstDay) firstDay = onboardDay;
  }
  const engaged = new Set();
  const recorded = new Set();
  events.forEach((event) => {
    if (!event || !event.timestamp) return;
    if (event.type === EventTypes.DAY_MISSED) {
      const key = missedDayKeyFromEvent(event);
      if (key) recorded.add(key);
      return;
    }
    engaged.add(getDateKey(new Date(event.timestamp)));
  });
  const historyDays = new Set(
    (Array.isArray(missionHistory) ? missionHistory : [])
      .map((entry) => entry?.date)
      .filter(Boolean),
  );
  for (
    let cursor = new Date(firstDay);
    cursor < today;
    cursor = LockInGoals.addDays(cursor, 1)
  ) {
    const key = getDateKey(cursor);
    if (engaged.has(key) || historyDays.has(key) || recorded.has(key)) continue;
    const stamp = new Date(cursor);
    stamp.setHours(12, 0, 0, 0);
    await eventApi.record(
      EventTypes.DAY_MISSED,
      { dateKey: key, arcDay: calculateArcState(cursor).currentDay },
      "lock-in",
      stamp.toISOString(),
    );
  }
}

async function CommandCenter() {
  await renderToday();
}

function nextIncompleteMission(missions, completed) {
  return missions.find((mission) => !completed.has(mission.id)) || missions[0] || null;
}

async function openFocusMode(missionId = null) {
  const missions = await buildTodayMissions();
  const completed = await completedMissionIds();
  const requestedId = typeof missionId === "string" ? missionId : null;
  const mission = requestedId
    ? missions.find((item) => item.id === requestedId)
    : nextIncompleteMission(missions, completed);
  if (!mission) return;
  focusMissionId = mission.id;
  $("focus-identity").textContent =
    mission.category || IDENTITY_CATALOG[mission.identityId]?.label || "Now";
  $("focus-title").textContent = mission.title;
  const cue = mission.cue;
  $("focus-cue").textContent = mission.goalTitle
    ? `Moves “${mission.goalTitle}”`
    : cue?.trigger
      ? `${cue.trigger}${cue.place ? ` · ${cue.place}` : ""}`
      : "Do this now.";
  $("focus-minimum").textContent = mission.minimumAction
    ? `Minimum: ${mission.minimumAction}`
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
    title: mission.title,
    reason,
  });
  await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
  if (!skipped) celebrate("That’s follow-through.", { burst: true });
  await renderToday();
}

function formatQuietDuration(durationMs) {
  const totalMinutes = Math.max(0, Math.round(Number(durationMs) / 60000));
  if (totalMinutes < 1) return "<1m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
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
      ? "You’re early. Show up and create proof."
      : "Long view: evidence, not vibes.";
  $("arc-year-progress").style.width = `${arcProgress}%`;
  $("arc-year-copy").textContent = `${arcProgress}% through. ${Math.max(0, totalDays - currentDay)} days left.`;
  const arcHero = document.querySelector(".arc-hero");
  if (arcHero) {
    arcHero.style.setProperty("--arc-progress", String(arcProgress));
    arcHero.setAttribute("data-arc-progress", `${arcProgress}`);
  }
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
          ? `${adherence.completed}/${adherence.planned} kept`
          : "No actions planned",
      ),
    );
    const bar = document.createElement("div");
    bar.className = "arc-bar";
    bar.append(document.createElement("span"));
    bar.firstChild.style.width = `${adherence.percent}%`;
    const percent = createTextElement("span", "arc-percent", `${adherence.percent}%`);
    row.append(copy, bar, percent);
    return { row, adherence, identityId };
  });
  $("arc-identity-bars").replaceChildren(
    ...(rows.length
      ? rows.map((item) => item.row)
      : [createTextElement("p", "arc-caption", "Choose identities and goals to start proof.")]),
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
  const leading = LockInGoals.chooseLeadingIdentity(
    rows.map((item) => ({ identityId: item.identityId, ...item.adherence })),
  );
  const leadingGoal = leading ? goalForIdentity(leading.identityId) : null;
  const leadingLabel = leading ? IDENTITY_CATALOG[leading.identityId]?.label : "";
  if (leadingGoal) {
    $("arc-transformation").textContent = leadingGoal.outcome;
    $("arc-transformation-copy").textContent =
      `${leading.completed}/${leading.planned} ${leadingLabel} actions happened. That identity has the most proof so far.`;
  } else if (leading) {
    $("arc-transformation").textContent = `${leadingLabel} is showing up.`;
    $("arc-transformation-copy").textContent =
      `${leading.completed}/${leading.planned} ${leadingLabel} actions happened. Write the goal this identity is becoming.`;
  } else {
    $("arc-transformation").textContent = "Not enough proof yet";
    $("arc-transformation-copy").textContent =
      "This names the goal whose identity has kept the most planned actions. Complete one to start.";
  }
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
  const switched = document.documentElement.dataset.screen !== screenId;
  document.documentElement.dataset.screen = screenId;
  document.documentElement.dataset.boot = APP_SCREENS.has(screenId) ? "app" : "onboarding";
  let activeScreen = null;
  screens.forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.hidden = !isActive;
    if (isActive) activeScreen = screen;
  });
  if (switched) {
    if (activeScreen) activeScreen.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0 });
  }
  celebrateRoot?.classList.remove("is-on");
  if (celebrateRoot) celebrateRoot.hidden = true;
  const inApp = APP_SCREENS.has(screenId);
  document.body.classList.toggle("app-ready", inApp);
  if (inApp && document.documentElement.classList.contains("is-ready")) void renderCueRail();
  else {
    const rail = $("today-cue-rail");
    if (rail) rail.hidden = true;
  }
}

function screenFromHash(hash = location.hash) {
  const key = hash.replace(/^#/, "");
  if (key === "events") return "event-debug-screen";
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
  if (screenId === "goals-screen") await renderIdentityGoals();
  if (screenId === "command-center-screen") await CommandCenter();
  if (screenId === "arc-screen") await renderArcScreen();
}

async function openAppScreen(screenId) {
  await loadAppScreen(screenId);
  navigateTo(screenId);
}

goalForm?.addEventListener("input", updateGoalReadiness);
goalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const existing = activeGoals.find((goal) => goal.id === $("goal-id").value);
  const draft = goalFromForm(existing);
  const validation = LockInGoals.validateGoalRecord(draft);
  if (!validation.valid) {
    goalFormError.textContent = validation.errors.join(" ");
    return;
  }
  const behaviors = validation.value.behaviors;
  const previous = existing
    ? activeBehaviors.filter((behavior) => behavior.goalId === existing.id)
    : [];
  const archivedKept = previous.filter(
    (behavior) =>
      behavior.status === "archived" && !behaviors.some((item) => item.id === behavior.id),
  );
  selectedIdentities.add(validation.value.identityId);
  saveSet(IDENTITIES_STORAGE_KEY, selectedIdentities);
  if (existing) {
    activeGoals = activeGoals.map((goal) => (goal.id === existing.id ? validation.value : goal));
    activeBehaviors = [
      ...activeBehaviors.filter((behavior) => behavior.goalId !== existing.id),
      ...behaviors,
      ...archivedKept,
    ];
  } else {
    activeGoals.push(validation.value);
    activeBehaviors.push(...behaviors);
  }
  await persistGoals();
  await eventApi.record(existing ? EventTypes.GOAL_UPDATED : EventTypes.GOAL_CREATED, {
    goalId: validation.value.id,
    identityId: validation.value.identityId,
    title: validation.value.title,
    status: validation.value.status,
  });
  const previousById = new Map(previous.map((behavior) => [behavior.id, behavior]));
  for (const behavior of behaviors) {
    const before = previousById.get(behavior.id);
    if (!before) {
      await eventApi.record(EventTypes.BEHAVIOR_CREATED, behaviorEventMeta(behavior));
    } else if (behaviorFieldsChanged(before, behavior)) {
      await eventApi.record(EventTypes.BEHAVIOR_UPDATED, behaviorEventMeta(behavior));
    }
  }
  goalDetail.hidden = true;
  await renderIdentityGoals();
  celebrate(existing ? "Goal updated." : "Goal locked in.", { burst: true });
});

$("cancel-goal")?.addEventListener("click", closeGoalDetail);
$("close-goal-detail")?.addEventListener("click", closeGoalDetail);
$("create-goal")?.addEventListener("click", openNewGoal);
$("add-goal-behavior")?.addEventListener("click", () => {
  $("goal-behavior-list")?.append(createBehaviorRow());
  decorateBehaviorRows(formValue("goal-id"));
});
$("pause-goal")?.addEventListener("click", async () => {
  const existing = activeGoals.find((goal) => goal.id === $("goal-id").value);
  await togglePauseGoal(existing);
});
$("release-goal")?.addEventListener("click", async () => {
  const existing = activeGoals.find((goal) => goal.id === $("goal-id").value);
  await confirmAndReleaseGoal(existing);
});
$("complete-goal")?.addEventListener("click", async () => {
  const existing = activeGoals.find((goal) => goal.id === $("goal-id").value);
  if (!existing) return;
  const confirmed = window.confirm(
    `Mark “${displayGoalTitle(existing)}” as reached? It will leave Today.`,
  );
  if (!confirmed) return;
  await setGoalLifecycle(existing, "completed");
  closeGoalDetail();
  await renderIdentityGoals();
  celebrate("Reached.", { burst: true });
});
todayTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = todayTaskInput?.value.trim();
  if (!title) return;
  const tasks = await readTodayTasks();
  tasks.push({
    id: globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}`,
    title,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  });
  await writeTodayTasks(tasks);
  todayTaskInput.value = "";
  await renderTodayTasks();
});
todayTaskList?.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const action = event.target.closest("[data-task-action]");
  if (!action) return;
  const taskId = action.dataset.taskId;
  const tasks = await readTodayTasks();
  const now = new Date().toISOString();
  const nextTasks = action.dataset.taskAction === "delete"
    ? tasks.filter((task) => task.id !== taskId)
    : tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
              completedAt: task.completed ? null : now,
            }
          : task,
      );
  await writeTodayTasks(nextTasks);
  await renderTodayTasks();
});
$("clear-today-tasks")?.addEventListener("click", async () => {
  const tasks = await readTodayTasks();
  await writeTodayTasks(tasks.filter((task) => !task.completed));
  await renderTodayTasks();
});
$("today-daily-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("today-daily-input");
  const title = input?.value.trim();
  if (!title) return;
  const dailies = await loadDailies();
  if (dailies.length >= LockInDailies.MAX_DAILIES) return;
  let daily = LockInDailies.normalizeDaily({ title }, new Date());
  if (dailies.some((item) => item.id === daily.id)) {
    daily = LockInDailies.normalizeDaily({ title, id: `daily-${Date.now()}` }, new Date());
  }
  await privateStorage.write(DAILIES_STORAGE_KEY, [...dailies, daily]);
  if (input) input.value = "";
  await renderTodayDailies();
});
$("today-daily-list")?.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const action = event.target.closest("[data-daily-action]");
  if (!action) return;
  const dailyId = action.dataset.dailyId;
  if (action.dataset.dailyAction === "delete") {
    const dailies = await loadDailies();
    await privateStorage.write(
      DAILIES_STORAGE_KEY,
      dailies.filter((daily) => daily.id !== dailyId),
    );
    await writeDailyCompletions((await loadDailyCompletions()).filter((id) => id !== dailyId));
    await renderTodayDailies();
    return;
  }
  const completions = await loadDailyCompletions();
  const done = completions.includes(dailyId);
  const next = done
    ? completions.filter((id) => id !== dailyId)
    : [...completions, dailyId];
  await writeDailyCompletions(next);
  const dailies = await loadDailies();
  const daily = dailies.find((item) => item.id === dailyId);
  await eventApi.record(done ? EventTypes.DAILY_UNCOMPLETED : EventTypes.DAILY_COMPLETED, {
    dailyId,
    title: daily?.title || "",
  });
  await renderTodayDailies();
});
$("today-cue-dismiss")?.addEventListener("click", () => dismissActiveCue());
$("today-cue-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("today-cue-input");
  const title = input?.value.trim();
  if (!title) return;
  const intervalMinutes = Number($("today-cue-interval")?.value);
  const cues = await loadCues();
  let cue = LockInCues.normalizeCue({ title, intervalMinutes }, new Date());
  if (cues.some((item) => item.id === cue.id)) {
    cue = LockInCues.normalizeCue(
      { title, intervalMinutes, id: `cue-${Date.now()}` },
      new Date(),
    );
  }
  await privateStorage.write(CUES_STORAGE_KEY, [...cues, cue]);
  if (input) input.value = "";
  await renderCueRail();
});
$("today-cue-list")?.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest("[data-cue-action='interval']")) return;
  const action = event.target.closest("[data-cue-action]");
  if (!action) return;
  const cues = await loadCues();
  const cueId = action.dataset.cueId;
  const nextCues =
    action.dataset.cueAction === "delete"
      ? cues.filter((cue) => cue.id !== cueId)
      : cues.map((cue) =>
          cue.id === cueId ? { ...cue, enabled: !cue.enabled } : cue,
        );
  await privateStorage.write(CUES_STORAGE_KEY, nextCues);
  const state = await loadCueState();
  if (state.pendingId === cueId && action.dataset.cueAction !== "toggle") {
    await privateStorage.write(CUE_STATE_STORAGE_KEY, LockInCues.markPending(state, ""));
  } else if (action.dataset.cueAction === "toggle") {
    const disabled = nextCues.find((cue) => cue.id === cueId && !cue.enabled);
    if (disabled && state.pendingId === cueId) {
      await privateStorage.write(
        CUE_STATE_STORAGE_KEY,
        LockInCues.markPending(state, ""),
      );
    }
  }
  await renderCueRail();
});
$("today-cue-list")?.addEventListener("change", async (event) => {
  if (!(event.target instanceof Element)) return;
  const input = event.target.closest("[data-cue-action='interval']");
  if (!input) return;
  const cueId = input.dataset.cueId;
  const intervalMinutes = Number(input.value);
  const cues = await loadCues();
  await privateStorage.write(
    CUES_STORAGE_KEY,
    cues.map((cue) =>
      cue.id === cueId ? LockInCues.normalizeCue({ ...cue, intervalMinutes }) : cue,
    ),
  );
  await renderCueRail();
});
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
$("lockin-browser-week")?.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-browser-day]");
  if (!button) return;
  const dateKey = button.dataset.browserDay;
  selectedBrowserDateKey = dateKey === getDateKey() ? null : dateKey;
  await renderTodayBrowser();
});
$("lockin-browser-today")?.addEventListener("click", async () => {
  selectedBrowserDateKey = null;
  await renderTodayBrowser();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (document.querySelector("#command-center-screen")?.hidden) return;
  void tickTodayClock();
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

function revealApp() {
  if (document.documentElement.classList.contains("is-ready")) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add("is-ready");
      window.setTimeout(() => {
        allowCueMotion = true;
        if (document.body.classList.contains("app-ready")) void renderCueRail();
      }, 600);
    });
  });
}

async function initializeApp() {
  try {
    const [
      storedGoals,
      storedBehaviors,
      storedHistory,
      storedExperiments,
      storedArcStart,
      storedOnboarded,
    ] = await Promise.all([
      privateStorage.read(GOALS_STORAGE_KEY, []),
      privateStorage.read(BEHAVIORS_STORAGE_KEY, []),
      privateStorage.read(MISSION_HISTORY_STORAGE_KEY, []),
      privateStorage.read(EXPERIMENTS_STORAGE_KEY, []),
      privateStorage.read(ARC_START_OVERRIDE_KEY, ""),
      privateStorage.read(ONBOARDING_COMPLETE_STORAGE_KEY, isOnboarded()),
    ]);
    if (storedOnboarded) storage.writeJson(ONBOARDING_COMPLETE_STORAGE_KEY, true);
    const migrated = LockInGoals.migrateGoalCollection(Array.isArray(storedGoals) ? storedGoals : []);
    activeGoals = migrated.goals;
    activeBehaviors = Array.isArray(storedBehaviors) && storedBehaviors.length
      ? storedBehaviors.map((behavior) => LockInGoals.normalizeBehaviorRecord(behavior))
      : migrated.behaviors;
    missionHistory = Array.isArray(storedHistory) ? storedHistory : [];
    experiments = Array.isArray(storedExperiments)
      ? storedExperiments.map((item) => LockInExperiments.normalizeExperiment(item))
      : [];
    const overrideStart = LockInGoals.parseDate(storedArcStart);
    applyArcStart(overrideStart || CONFIGURED_ARC_START);
    await persistGoals();
    await backfillMissedDays();
    populateCategorySelect([...selectedIdentities][0]);
    populateLifeAreaSelect(LockInGoals.DEFAULT_LIFE_AREA);

    renderArcState();
    if (!isOnboarded()) {
      renderIdentitySelections();
      renderStartingPoint();
      renderBlueprint();
    }

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
  } finally {
    revealApp();
  }
}

initializeApp();
setInterval(renderArcState, 60 * 60 * 1000);
setInterval(() => {
  tickTodayClock();
}, 60 * 1000);
if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CUE_DUE") void renderCueRail();
  });
}
if (globalThis.chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CUES_STORAGE_KEY] || changes[CUE_STATE_STORAGE_KEY]) {
      void renderCueRail();
    }
  });
}
