const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PERSONAL_CONFIG = LockInGoals.validatePersonalConfig(
  globalThis.LOCK_IN_PERSONAL_CONFIG ?? {
    schemaVersion: 1,
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
const MISSION_HISTORY_STORAGE_KEY = "lock-in-mission-history-v1";
const WEEKLY_REVIEWS_STORAGE_KEY = "lock-in-weekly-reviews-v1";
const COACH_API_URL = "http://127.0.0.1:8787/api/coach";
const COACH_HEALTH_URL = "http://127.0.0.1:8787/health";
const COACH_LOADING_MESSAGE = "Looking for the useful signal…";

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
let missionHistory = [];
let weeklyReviews = [];

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
  "low-energy": "Keep the first step small enough for today.",
  consistency: "The smallest version still counts.",
  procrastination: "Start for two minutes.",
  distraction: "Close one extra tab before you begin.",
  "chaotic-schedule": "Use one opening you actually have today.",
  priorities: "Start with the first one. Ignore the rest for now.",
  "fall-off": "Restarting counts. Begin with one small action.",
  motivation: "You don't need to feel ready. Two minutes is enough.",
  overwhelmed: "One visible next action.",
  "not-sure": "Pick the first one. Starting will tell you more.",
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

const MOOD_LABELS = {
  low: "Low",
  meh: "Meh",
  good: "Good",
  "locked-in": "Locked in",
};

const daysRemainingElement = document.querySelector("#days-remaining");
const arcDayElement = document.querySelector("#arc-day");
const arcTitleElement = document.querySelector("#arc-title");
const arcDateRangeElement = document.querySelector("#arc-date-range");
const screens = document.querySelectorAll(".screen");
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
const missionList = document.querySelector("#mission-list");
const missionProgressSummary = document.querySelector(
  "#mission-progress-summary",
);
const missionEncouragement = document.querySelector("#mission-encouragement");
const becomingDate = document.querySelector("#becoming-date");
const becomingIdentities = document.querySelector("#becoming-identities");
const commandGoals = document.querySelector("#command-goals");
const arcProgress = document.querySelector("#arc-progress");
const arcProgressFill = document.querySelector("#arc-progress-fill");
const moodButtons = [...document.querySelectorAll("[data-mood]")];
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
const openGoalsButton = document.querySelector("#open-goals");
const closeGoalsButton = document.querySelector("#close-goals");
const openWeeklyReviewButton = document.querySelector("#open-weekly-review");
const closeWeeklyReviewButton = document.querySelector("#close-weekly-review");
const goalForm = document.querySelector("#goal-form");
const goalFormTitle = document.querySelector("#goal-form-title");
const goalFormError = document.querySelector("#goal-form-error");
const goalCount = document.querySelector("#goal-count");
const savedGoalList = document.querySelector("#saved-goal-list");
const newGoalButton = document.querySelector("#new-goal");
const cancelGoalButton = document.querySelector("#cancel-goal");
const smartSummary = document.querySelector("#smart-summary");
const smartProgress = document.querySelector("#smart-progress");
const milestoneCard = document.querySelector("#milestone-card");
const milestoneTitle = document.querySelector("#milestone-title");
const milestoneCountdown = document.querySelector("#milestone-countdown");
const milestoneTask = document.querySelector("#milestone-task");
const weeklyConsistency = document.querySelector("#weekly-consistency");
const recoveryMessage = document.querySelector("#recovery-message");
const weeklyReviewForm = document.querySelector("#weekly-review-form");
const weeklyReviewStatus = document.querySelector("#weekly-review-status");
const reviewCreateGoalButton = document.querySelector("#review-create-goal");
const saveWeeklyReviewButton = document.querySelector("#save-weekly-review");
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
const auditGoalProgress = document.querySelector("#audit-goal-progress");
const auditHighlights = document.querySelector("#audit-highlights");
const auditMisses = document.querySelector("#audit-misses");
const auditDomains = document.querySelector("#audit-domains");
const auditPatternList = document.querySelector("#audit-pattern-list");
const askCoachButton = document.querySelector("#ask-coach");
const coachLoading = document.querySelector("#coach-loading");
const coachResponse = document.querySelector("#coach-response");
const coachError = document.querySelector("#coach-error");
const coachObservation = document.querySelector("#coach-observation");
const coachPattern = document.querySelector("#coach-pattern");
const coachPriority = document.querySelector("#coach-priority");
const coachNextAction = document.querySelector("#coach-next-action");
const coachEncouragement = document.querySelector("#coach-encouragement");

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
  if (ARC_CONFIG.name) {
    arcTitleElement.textContent = ARC_CONFIG.name;
  }
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

function getGoalFormValue(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function goalFromForm(existingGoal = null) {
  const now = new Date().toISOString();
  return LockInGoals.normalizeGoalRecord({
    version: 1,
    id:
      existingGoal?.id ??
      globalThis.crypto?.randomUUID?.() ??
      `goal-${Date.now()}`,
    area: getGoalFormValue("goal-area"),
    outcome: getGoalFormValue("goal-outcome"),
    why: getGoalFormValue("goal-why"),
    metric: {
      baseline: Number(getGoalFormValue("metric-baseline")),
      target: Number(getGoalFormValue("metric-target")),
      current: Number(getGoalFormValue("metric-current")),
      unit: getGoalFormValue("metric-unit"),
    },
    deadline: getGoalFormValue("goal-deadline"),
    frequencyPerWeek: Number(getGoalFormValue("goal-frequency")),
    cue: {
      trigger: getGoalFormValue("cue-trigger"),
      time: getGoalFormValue("cue-time"),
      place: getGoalFormValue("cue-place"),
    },
    actions: {
      minimum: getGoalFormValue("action-minimum"),
      standard: getGoalFormValue("action-standard"),
      stretch: getGoalFormValue("action-stretch"),
    },
    obstacle: getGoalFormValue("goal-obstacle"),
    recoveryPlan: getGoalFormValue("goal-recovery"),
    reward: getGoalFormValue("goal-reward"),
    status: existingGoal?.status ?? "active",
    timestamps: {
      createdAt: existingGoal?.timestamps?.createdAt ?? now,
      updatedAt: now,
    },
  });
}

function renderSmartProgress() {
  const draft = goalFromForm(
    activeGoals.find(({ id }) => id === document.querySelector("#goal-id").value),
  );
  const { completed } = LockInGoals.calculateSMARTCompleteness(draft);
  smartSummary.textContent =
    completed === 5
      ? "Ready to save."
      : `${completed} of 5 filled in.`;
  smartProgress.setAttribute("aria-valuenow", String(completed));
  [...smartProgress.children].forEach((segment, index) => {
    segment.classList.toggle("is-complete", index < completed);
  });
}

function resetGoalForm() {
  goalForm.reset();
  document.querySelector("#goal-id").value = "";
  document.querySelector("#metric-current").value = "";
  goalFormTitle.textContent = "New goal";
  goalFormError.textContent = "";
  goalForm.hidden = false;
  renderSmartProgress();
}

function fillGoalForm(goal) {
  const values = {
    "goal-id": goal.id,
    "goal-area": goal.area,
    "goal-outcome": goal.outcome,
    "goal-why": goal.why,
    "metric-baseline": goal.metric.baseline,
    "metric-target": goal.metric.target,
    "metric-current": goal.metric.current,
    "metric-unit": goal.metric.unit,
    "goal-deadline": goal.deadline,
    "goal-frequency": goal.frequencyPerWeek,
    "cue-trigger": goal.cue.trigger,
    "cue-time": goal.cue.time,
    "cue-place": goal.cue.place,
    "action-minimum": goal.actions.minimum,
    "action-standard": goal.actions.standard,
    "action-stretch": goal.actions.stretch,
    "goal-obstacle": goal.obstacle,
    "goal-recovery": goal.recoveryPlan,
    "goal-reward": goal.reward,
  };
  Object.entries(values).forEach(([id, value]) => {
    document.querySelector(`#${id}`).value = value ?? "";
  });
  document.querySelector("#goal-feasible").checked = true;
  goalFormTitle.textContent = "Edit goal";
  goalFormError.textContent = "";
  goalForm.hidden = false;
  renderSmartProgress();
}

async function updateGoalStatus(goal, status) {
  const updated = {
    ...goal,
    status,
    timestamps: { ...goal.timestamps, updatedAt: new Date().toISOString() },
  };
  activeGoals = activeGoals.map((item) => (item.id === goal.id ? updated : item));
  await privateStorage.write(GOALS_STORAGE_KEY, activeGoals);
  await eventApi.record(EventTypes.GOAL_UPDATED, { goalId: goal.id, status });
  renderGoalList();
  await CommandCenter();
}

function renderGoalList() {
  const activeCount = activeGoals.filter(({ status }) => status === "active").length;
  goalCount.textContent = `${activeCount} / 3`;
  newGoalButton.disabled = activeCount >= 3;

  if (activeGoals.length === 0) {
    savedGoalList.replaceChildren(
      createTextElement("p", "event-list-empty", "No goals yet. Start with one."),
    );
    return;
  }

  savedGoalList.replaceChildren(
    ...activeGoals
      .filter(({ status }) => status !== "archived")
      .map((goal) => {
        const card = document.createElement("article");
        card.className = "saved-goal-card";
        card.dataset.status = goal.status;
        const area = AREA_BLUEPRINTS[goal.area]?.label ?? goal.area;
        const edit = createTextElement("button", "", "Edit");
        const pause = createTextElement(
          "button",
          "",
          goal.status === "active" ? "Pause" : "Resume",
        );
        const archive = createTextElement("button", "", "Archive");
        edit.type = pause.type = archive.type = "button";
        edit.addEventListener("click", () => fillGoalForm(goal));
        pause.addEventListener("click", () =>
          updateGoalStatus(goal, goal.status === "active" ? "paused" : "active"),
        );
        archive.addEventListener("click", () => updateGoalStatus(goal, "archived"));
        const actions = document.createElement("div");
        actions.className = "saved-goal-actions";
        actions.append(edit, pause, archive);
        card.append(
          createTextElement("small", "aside-kicker", toSentenceCase(area)),
          createTextElement("h3", "", goal.outcome),
          createTextElement(
            "p",
            "",
            `${goal.metric.current} / ${goal.metric.target} ${goal.metric.unit} · by ${goal.deadline}`,
          ),
          actions,
        );
        return card;
      }),
  );
}

function getMilestoneState(date = new Date()) {
  const milestones = Array.isArray(PERSONAL_CONFIG.milestones)
    ? PERSONAL_CONFIG.milestones
    : [];
  const upcoming = milestones
    .map((milestone) => ({
      ...milestone,
      daysUntil: LockInGoals.differenceInCalendarDays(milestone.date, date),
    }))
    .filter(({ daysUntil }) => Number.isFinite(daysUntil) && daysUntil >= 0)
    .sort((first, second) => first.daysUntil - second.daysUntil);
  const next = upcoming[0] ?? null;
  if (!next) {
    return { next: null, task: null };
  }
  const windows = Array.isArray(next.preparationWindows)
    ? [...next.preparationWindows].sort(
        (first, second) => Number(first.daysBefore) - Number(second.daysBefore),
      )
    : [];
  const activeWindow = windows.find(
    ({ daysBefore }) => next.daysUntil <= Number(daysBefore),
  );
  const taskText = activeWindow?.tasks?.find((task) => {
    const text = typeof task === "string" ? task : task?.title ?? task?.action;
    const taskId = `${next.id}:${Number(activeWindow.daysBefore)}:${text}`;
    return (
      text &&
      !missionHistory.some(
        (entry) => entry.milestoneTaskId === taskId && entry.completed,
      )
    );
  });
  const text =
    typeof taskText === "string" ? taskText : taskText?.title ?? taskText?.action;
  return {
    next,
    task: text
      ? {
          id: `${next.id}:${Number(activeWindow.daysBefore)}:${text}`,
          milestoneId: next.id,
          title: text,
          daysUntil: next.daysUntil,
        }
      : null,
  };
}

function buildTodayMissions() {
  const adaptiveMissions = LockInGoals.selectDailyMissions(
    activeGoals,
    missionHistory,
    PERSONAL_CONFIG.milestones ?? [],
    new Date(),
    3,
  ).map((mission) => {
    const goal = activeGoals.find(({ id }) => id === mission.goalId);
    return {
      id: mission.id,
      goalId: mission.goalId,
      area: mission.area,
      category: AREA_BLUEPRINTS[mission.area]?.label ?? mission.area,
      title: goal?.outcome ?? mission.outcome,
      description: mission.action,
        target: goal?.cue?.trigger
          ? `When ${goal.cue.trigger} · ${goal.cue.place}`
          : "Today",
      minimumAction: goal?.actions?.minimum,
      standardAction: goal?.actions?.standard,
      stretchAction: goal?.actions?.stretch,
    };
  });
  const milestone = getMilestoneState().task;
  if (milestone) {
    adaptiveMissions.unshift({
      id: `milestone:${milestone.id}`,
      milestoneTaskId: milestone.id,
      area: "milestone",
      category: "MILESTONE",
      title: milestone.title,
      description: "A date that matters is close.",
      target:
        milestone.daysUntil === 0
          ? "Today"
          : `${milestone.daysUntil} ${milestone.daysUntil === 1 ? "day" : "days"} left`,
      minimumAction: milestone.title,
      standardAction: milestone.title,
    });
  }
  if (adaptiveMissions.length > 0) {
    return adaptiveMissions.slice(0, 3);
  }

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
    isComplete ? "Done" : "Mark done",
  );
  completeButton.type = "button";
  completeButton.setAttribute("aria-pressed", String(isComplete));
  completeButton.addEventListener("click", async () => {
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
        goalId: mission.goalId,
        milestoneTaskId: mission.milestoneTaskId,
        level: wasComplete ? null : "standard",
        category: mission.category,
        title: mission.title,
      },
    );
    if (!wasComplete && mission.milestoneTaskId) {
      eventApi.record(EventTypes.MILESTONE_TASK_COMPLETED, {
        milestoneTaskId: mission.milestoneTaskId,
        title: mission.title,
      });
    }
    missionHistory = missionHistory.filter(
      (entry) => !(entry.missionId === mission.id && entry.date === getDateKey()),
    );
    missionHistory.push({
      missionId: mission.id,
      goalId: mission.goalId,
      milestoneTaskId: mission.milestoneTaskId,
      area: mission.area ?? mission.category,
      date: getDateKey(),
      planned: true,
      completed: !wasComplete,
      level: wasComplete ? null : "standard",
    });
    await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
    TodayMission();
    renderWeeklyConsistency();
  });

  if (!isComplete && mission.minimumAction) {
    const levels = document.createElement("div");
    levels.className = "completion-levels";
    [
      ["minimum", "Min"],
      ["standard", "Standard"],
      ...(mission.stretchAction ? [["stretch", "Stretch"]] : []),
    ].forEach(([level, label]) => {
      const button = createTextElement("button", "", label);
      button.type = "button";
      button.title =
        level === "standard"
          ? mission.standardAction ?? mission.description
          : level === "stretch"
            ? mission.stretchAction
            : mission.minimumAction;
      button.addEventListener("click", async () => {
        completedMissions.add(mission.id);
        storage.writeJson(
          getDailyStorageKey("completed-missions"),
          [...completedMissions],
        );
        await eventApi.record(EventTypes.MISSION_COMPLETED, {
          missionId: mission.id,
          goalId: mission.goalId,
          milestoneTaskId: mission.milestoneTaskId,
          level,
          category: mission.category,
          title: mission.title,
        });
        if (mission.milestoneTaskId) {
          await eventApi.record(EventTypes.MILESTONE_TASK_COMPLETED, {
            milestoneTaskId: mission.milestoneTaskId,
            title: mission.title,
          });
        }
        missionHistory = missionHistory.filter(
          (entry) =>
            !(entry.missionId === mission.id && entry.date === getDateKey()),
        );
        missionHistory.push({
          missionId: mission.id,
          goalId: mission.goalId,
          milestoneTaskId: mission.milestoneTaskId,
          area: mission.area ?? mission.category,
          date: getDateKey(),
          planned: true,
          completed: true,
          level,
        });
        await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
        TodayMission();
        renderWeeklyConsistency();
      });
      levels.append(button);
    });
    footer.append(levels);
  } else {
    footer.append(completeButton);
  }
  card.append(category, title, description);
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

  missionProgressSummary.textContent = `${completedCount} of ${missions.length}`;
  const encouragement = [
    obstacleNudge ?? "Choose your first move. You can handle it. ✨",
    "One down. Keep it sharp and doable. ✨",
    "One left. Finish clean if it still matters. 🔥",
    "Done. Enjoy that. 💅",
  ];
  const nudge =
    encouragement[Math.min(completedCount, encouragement.length - 1)];
  missionEncouragement.textContent = nudge;
  missionEncouragement.hidden = !nudge;

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
    arcProgress.setAttribute("aria-valuenow", "0");
    arcProgress.setAttribute("aria-valuemax", String(totalDays));
    arcProgressFill.style.width = "0%";
    return;
  }

  const progress = (day / totalDays) * 100;

  commandArcDay.textContent =
    currentDay > totalDays ? "Arc complete" : `Day ${day} of ${totalDays}`;
  arcProgress.setAttribute("aria-valuenow", String(day));
  arcProgress.setAttribute("aria-valuemax", String(totalDays));
  arcProgressFill.style.width = `${progress}%`;
}

function MoodCheckIn() {
  const mood = storage.readText(getDailyStorageKey("mood"));

  moodButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === mood));
  });
}

function renderBecomingReminder(missions, completedToday) {
  becomingDate.textContent = `By ${ARC_END_DATE.toLocaleDateString([], {
    month: "long",
    day: "numeric",
  })}`;

  const identities = [...selectedIdentities]
    .map((identity) => IDENTITY_LABELS[identity])
    .filter(Boolean);
  becomingIdentities.textContent =
    identities.length > 0
      ? identities.join(" · ")
      : "Focused · self-trusting · fully yours";

  const nextGoalId = missions.find(
    (mission) =>
      mission.goalId && !completedToday.has(mission.id),
  )?.goalId;
  const goals = activeGoals
    .filter(({ status }) => status === "active")
    .sort((first, second) => {
      if (first.id === nextGoalId) return -1;
      if (second.id === nextGoalId) return 1;
      return 0;
    });
  if (goals.length === 0) {
    commandGoals.replaceChildren(
      createTextElement(
        "p",
        "command-goals__empty",
        "Your goals will stay here once you add them.",
      ),
    );
    return;
  }

  commandGoals.replaceChildren(
    ...goals.map((goal, index) => {
      const item = document.createElement("article");
      const isPriority = goal.id === nextGoalId || (!nextGoalId && index === 0);
      const progressRange = goal.metric.target - goal.metric.baseline;
      const progressPercent = Math.round(
        Math.min(
          1,
          Math.max(
            0,
            progressRange === 0
              ? 0
              : (goal.metric.current - goal.metric.baseline) / progressRange,
          ),
        ) * 100,
      );
      const progress = `${goal.metric.current} of ${goal.metric.target} ${goal.metric.unit}`;
      const progressTrack = document.createElement("span");
      const progressFill = document.createElement("span");
      progressTrack.className = "command-goals__progress";
      progressTrack.setAttribute("role", "progressbar");
      progressTrack.setAttribute("aria-label", `${goal.outcome} progress`);
      progressTrack.setAttribute("aria-valuemin", "0");
      progressTrack.setAttribute("aria-valuemax", "100");
      progressTrack.setAttribute("aria-valuenow", String(progressPercent));
      progressFill.style.width = `${progressPercent}%`;
      progressTrack.append(progressFill);

      item.className = isPriority
        ? "command-goal command-goal--priority"
        : "command-goal";
      item.append(
        createTextElement(
          "span",
          "command-goals__rank",
          isPriority ? "Today's priority" : `Goal ${index + 1}`,
        ),
        createTextElement("strong", "", goal.outcome),
        createTextElement("small", "", progress),
        progressTrack,
      );
      if (goal.actions.minimum) {
        item.append(
          createTextElement(
            "small",
            "command-goals__minimum",
            `On a hard day: ${goal.actions.minimum}`,
          ),
        );
      }
      return item;
    }),
  );
}

function renderMilestone() {
  const { next, task } = getMilestoneState();
  const isToday = next?.daysUntil === 0;
  const isActiveReminder = Boolean(task) || isToday;
  milestoneCard.hidden = !isActiveReminder;
  if (!isActiveReminder) {
    return;
  }
  milestoneCard.classList.toggle("personal-reminder--today", isToday);
  milestoneTitle.textContent = next.label ?? "Upcoming milestone";
  milestoneCountdown.textContent =
    isToday
      ? "Today"
      : `In ${next.daysUntil} ${next.daysUntil === 1 ? "day" : "days"}`;
  milestoneTask.textContent = task?.title ?? "Preparation is done. Be there for it.";
}

function renderWeeklyConsistency() {
  const weekStart = LockInGoals.startOfWeek(new Date());
  const consistency = LockInGoals.calculateWeeklyConsistency(
    missionHistory,
    weekStart,
    new Date(),
  );
  weeklyConsistency.textContent = consistency.planned
    ? `${consistency.completed} of ${consistency.planned} · ${consistency.percent}%`
    : "Nothing planned yet";

  const recentMiss = [...missionHistory]
    .reverse()
    .find((entry) => entry.planned && !entry.completed && entry.goalId);
  const goal = activeGoals.find(({ id }) => id === recentMiss?.goalId);
  const recovery = goal
    ? LockInGoals.buildLapseRecovery(goal, {
        date: recentMiss.date,
        nextDate: new Date(),
      }).message
    : "";
  recoveryMessage.textContent = recovery;
  recoveryMessage.hidden = !recovery;
}

function getTimeBasedGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) {
    return "Still up 🌌";
  }
  if (hour < 12) {
    return "Good morning ☀️";
  }
  if (hour < 17) {
    return "Good afternoon ✨";
  }
  if (hour < 21) {
    return "Good evening 🌙";
  }
  return "Good night 🌙";
}

function renderCommandGreeting(date = new Date()) {
  commandGreeting.textContent = getTimeBasedGreeting(date);
}

async function CommandCenter() {
  const arcState = getCommandArcState();
  const missions = buildTodayMissions();
  const completedToday = new Set(
    storage.readJson(getDailyStorageKey("completed-missions"), []),
  );
  missions.forEach((mission) => {
    const exists = missionHistory.some(
      (entry) => entry.missionId === mission.id && entry.date === getDateKey(),
    );
    if (!exists) {
      missionHistory.push({
        missionId: mission.id,
        goalId: mission.goalId,
        milestoneTaskId: mission.milestoneTaskId,
        area: mission.area ?? mission.category,
        date: getDateKey(),
        planned: true,
        completed: completedToday.has(mission.id),
      });
    }
  });
  await privateStorage.write(MISSION_HISTORY_STORAGE_KEY, missionHistory);
  renderCommandGreeting();
  TodayMission(missions);
  ArcProgress(arcState);
  MoodCheckIn();
  renderBecomingReminder(missions, completedToday);
  renderMilestone();
  renderWeeklyConsistency();
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
let debugReturnFocus = null;

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
    return "No check-in";
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
        title: "You followed through ✨",
        detail: "Most of what you planned actually happened. That's yours.",
      };
    case "SOLID":
      return {
        title: "A solid day ✨",
        detail: "The important parts moved forward. Keep that energy.",
      };
    case "MIXED":
      return {
        title: "A mixed day",
        detail: "Some of it landed. Some of it didn't.",
      };
    case "NEEDS_ATTENTION":
      return {
        title: "A lighter day",
        detail: "No shame. Reset your crown and choose one clear next step. 👑",
      };
    default:
      if (hasPartialData) {
        return {
          title: "A partial picture",
          detail: "Some activity was captured, but no missions were planned.",
        };
      }
      if (!isToday) {
        return {
          title: "Not enough for this day",
          detail: "There wasn't enough recorded activity to look back on.",
        };
      }
      return {
        title: "Still unfolding",
        detail: "Check in as you go. This will fill in.",
      };
  }
}

function getPatternCopy(pattern) {
  switch (pattern.type) {
    case "HIGH_DISTRACTION_TIME":
      return {
        title: `A long stretch on ${pattern.domain}`,
        detail: `${formatAuditDuration(pattern.durationMs)}. Did that match what you meant to do?`,
      };
    case "STRONG_MISSION_COMPLETION":
      return {
        title: "The plan became action",
        detail: "You finished at least 80% of today's missions.",
      };
    case "LOW_MISSION_COMPLETION":
      return {
        title: "Tomorrow could be lighter",
        detail: "Fewer or smaller missions might be easier to enter.",
      };
    case "NO_MISSION_ACTIVITY":
      return {
        title: "Missions stayed untouched",
        detail: "A plan was there. Nothing was marked done.",
      };
    case "LIMITED_BROWSER_DATA":
      return {
        title: "Browser time is still thin",
        detail: "No finished sessions were recorded. That doesn't mean you were idle.",
      };
    default:
      return {
        title: "Something stood out",
        detail: "Not enough detail for this one yet.",
      };
  }
}

function renderAuditList(container, items, marker, emptyCopy) {
  const rows = items.map((item) => {
    const row = document.createElement("p");
    row.setAttribute("role", "listitem");
    row.append(
      createTextElement("span", "audit-list__marker", marker),
      createTextElement("span", "", item),
    );
    return row;
  });

  if (rows.length === 0) {
    const emptyRow = createTextElement("p", "audit-list__empty", emptyCopy);
    emptyRow.setAttribute("role", "listitem");
    rows.push(emptyRow);
  }
  container.replaceChildren(...rows);
}

let selectedAuditDate = new Date();

async function renderDailyAudit() {
  const audit = await auditService.generateDailyAudit(selectedAuditDate);
  const milestoneOnDate = (PERSONAL_CONFIG.milestones ?? []).find(
    ({ date }) => date === audit.date,
  );
  const milestoneYesterday = (PERSONAL_CONFIG.milestones ?? []).find(
    ({ date }) =>
      LockInGoals.differenceInCalendarDays(audit.date, date) === 1,
  );
  const todayKey = getDateKey(new Date());
  const isToday = audit.date === todayKey;
  const isFuture = audit.date > todayKey;
  const hasNoFutureData =
    isFuture && audit.verdict === "INSUFFICIENT_DATA";
  const hasPartialData =
    audit.mood.selected !== null || audit.browser.totalObservedMs > 0;

  auditDateLabel.textContent = isToday ? "Today" : isFuture ? "Upcoming" : "Past";
  auditViewTitle.textContent = isToday
    ? "Today"
    : isFuture
      ? "Upcoming"
      : "Looking back";
  auditDateElement.dateTime = audit.date;
  auditDateElement.textContent = selectedAuditDate.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
  auditMissions.textContent = `${audit.missions.completed} / ${audit.missions.total}`;
  auditMood.textContent = formatMood(audit.mood.selected);
  auditBrowserTotal.textContent = formatAuditDuration(
    audit.browser.totalObservedMs,
  );
  auditFocus.textContent = audit.guidance.focus;
  auditAddMore.textContent = audit.guidance.addMore;
  auditMakeInteresting.textContent = audit.guidance.makeItInteresting;
  const levelSummary = audit.missions.levels
    ? `${audit.missions.levels.minimum} min · ${audit.missions.levels.standard} standard · ${audit.missions.levels.stretch} stretch`
    : "No completion levels recorded";
  const goalRows = Object.entries(audit.missions.byGoal ?? {}).map(
    ([goalId, count]) => {
      const goal = activeGoals.find(({ id }) => id === goalId);
      return `${goal?.outcome ?? "Goal"}: ${count} completed ${
        count === 1 ? "action" : "actions"
      }`;
    },
  );
  if (milestoneOnDate) {
    goalRows.unshift(
      `${milestoneOnDate.label}: the day itself. Be there for it.`,
    );
  } else if (milestoneYesterday) {
    goalRows.unshift(
      `After ${milestoneYesterday.label}: keep what mattered.`,
    );
  }
  renderAuditList(
    auditGoalProgress,
    [levelSummary, ...goalRows],
    "↗",
    "No goal actions yet.",
  );

  renderAuditList(
    auditHighlights,
    audit.highlights,
    "✓",
    "Nothing yet.",
  );
  renderAuditList(
    auditMisses,
    audit.misses,
    "→",
    "Nothing pressing.",
  );

  const domainRows = audit.browser.topDomains.map(({ domain, durationMs }) => {
    const row = document.createElement("div");
    row.setAttribute("role", "listitem");
    row.append(
      createTextElement("span", "", domain),
      createTextElement("strong", "", formatAuditDuration(durationMs)),
    );
    return row;
  });
  if (domainRows.length === 0) {
    const emptyRow = createTextElement(
      "p",
      "audit-list__empty",
      "No browser time recorded.",
    );
    emptyRow.setAttribute("role", "listitem");
    domainRows.push(emptyRow);
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
    row.setAttribute("data-severity", pattern.severity);
    row.setAttribute("role", "listitem");
    row.append(
      createTextElement("h3", "", copy.title),
      createTextElement("p", "", copy.detail),
    );
    return row;
  });
  if (patternRows.length === 0) {
    const emptyRow = createTextElement(
      "p",
      "audit-list__empty",
      "Nothing unusual.",
    );
    emptyRow.setAttribute("role", "listitem");
    patternRows.push(emptyRow);
  }
  auditPatternList.replaceChildren(...patternRows);
}

async function collectCoachContext(date = new Date()) {
  const auditDates = Array.from(
    { length: LockInCoachContext.RECENT_WINDOW_DAYS },
    (_, dayOffset) => {
      const auditDate = new Date(date);
      auditDate.setDate(auditDate.getDate() - dayOffset);
      return auditDate;
    },
  );
  const start = new Date(auditDates.at(-1));
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const [recentEvents, audits] = await Promise.all([
    eventApi.getEventsBetween(start, end),
    Promise.all(
      auditDates.map((auditDate) =>
        auditService.generateDailyAudit(auditDate),
      ),
    ),
  ]);

  const goals = activeGoals
    .filter(({ status }) => status === "active")
    .map((goal) => ({
      id: goal.id,
      area: goal.area,
      outcome: goal.outcome,
      why: goal.why,
      metric: goal.metric,
      deadline: goal.deadline,
      frequencyPerWeek: goal.frequencyPerWeek,
      cue: goal.cue,
      actions: goal.actions,
      obstacle: goal.obstacle,
      recoveryPlan: goal.recoveryPlan,
    }));
  const completedMissions = new Set(
    storage.readJson(getDailyStorageKey("completed-missions"), []),
  );
  const currentMissions = buildTodayMissions().map((mission) => {
    const history = missionHistory.find(
      (entry) =>
        entry.date === getDateKey(date) && entry.missionId === mission.id,
    );
    return {
      id: mission.id,
      goalId: mission.goalId,
      category: mission.category,
      title: mission.title,
      description: mission.description,
      target: mission.target,
      completed: completedMissions.has(mission.id),
      completionLevel: history?.level ?? null,
    };
  });
  const upcomingMilestones = (PERSONAL_CONFIG.milestones ?? [])
    .filter(
      ({ date: milestoneDate }) =>
        LockInGoals.differenceInCalendarDays(milestoneDate, date) >= 0,
    )
    .slice(0, 3)
    .map(({ id, label, date: milestoneDate }) => ({
      id,
      label,
      date: milestoneDate,
    }));

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
      upcomingMilestones,
    },
    goals,
    todayAudit: audits[0],
    recentAudits: audits.slice(1),
    recentEvents,
    currentMissions,
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

async function ensureCoachBackend() {
  if (await isCoachReachable()) {
    return;
  }

  coachLoading.textContent = "Starting the local coach…";

  if (!globalThis.chrome?.runtime?.sendMessage) {
    throw new Error(
      "Run npm run setup-coach once, reload LOCK IN, then click Ask Coach again.",
    );
  }

  let result;
  try {
    result = await chrome.runtime.sendMessage({ type: "ENSURE_COACH_BACKEND" });
  } catch {
    throw new Error(
      "Reload LOCK IN on chrome://extensions after running npm run setup-coach, then try Ask Coach again.",
    );
  }

  if (result?.ok) {
    return;
  }

  if (!result || result?.code === "NATIVE_HOST_UNAVAILABLE") {
    throw new Error(
      "Run npm run setup-coach once in the LOCK IN folder, reload the extension, then click Ask Coach again.",
    );
  }

  throw new Error(result?.error || "Could not start the local coach.");
}

async function askCoach() {
  askCoachButton.disabled = true;
  coachLoading.textContent = COACH_LOADING_MESSAGE;
  coachLoading.hidden = false;
  coachResponse.hidden = true;
  coachError.hidden = true;

  try {
    await ensureCoachBackend();
    coachLoading.textContent = COACH_LOADING_MESSAGE;
    const response = await fetch(COACH_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await collectCoachContext()),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "The coach could not respond right now.");
    }
    const coaching = result.coaching;
    const fields = [
      coaching?.observation,
      coaching?.pattern,
      coaching?.priority,
      coaching?.nextAction,
      coaching?.encouragement,
    ];
    if (fields.some((field) => typeof field !== "string" || !field.trim())) {
      throw new Error("The coach returned an incomplete response.");
    }

    coachObservation.textContent = coaching.observation.trim();
    coachPattern.textContent = coaching.pattern.trim();
    coachPriority.textContent = coaching.priority.trim();
    coachNextAction.textContent = coaching.nextAction.trim();
    coachEncouragement.textContent = coaching.encouragement.trim();
    coachResponse.hidden = false;
  } catch (error) {
    coachError.textContent =
      error instanceof TypeError
        ? "Could not reach the coach. Reload LOCK IN after running npm run setup-coach."
        : error.message;
    coachError.hidden = false;
  } finally {
    coachLoading.textContent = COACH_LOADING_MESSAGE;
    coachLoading.hidden = true;
    askCoachButton.disabled = false;
  }
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

  observerStatus.textContent = isActive ? "Active" : "Idle";
  observerStatusDot.parentElement.classList.toggle(
    "observer-status--active",
    isActive,
  );
  observerDomain.textContent = activeSession?.domain ?? "None";
  observerDuration.textContent = activeSession
    ? formatDuration(activeDuration)
    : "0s";
  observerTotal.textContent = formatDuration(totalDuration);
  const domainRows = domainTotals.slice(0, 5).map(({ domain, durationMs }) => {
      const row = document.createElement("div");
      row.className = "observer-domain-row";
      row.setAttribute("role", "listitem");
      row.append(
        createTextElement("span", "", domain),
        createTextElement("strong", "", formatDuration(durationMs)),
      );
      return row;
    });
  if (domainRows.length === 0) {
    const empty = createTextElement(
      "p",
      "observer-domains-empty",
      "No domains tracked today.",
    );
    empty.setAttribute("role", "listitem");
    domainRows.push(empty);
  }
  observerDomains.replaceChildren(...domainRows);
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

function formatEventType(type) {
  return String(type)
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function renderEventStream() {
  const events = (await eventApi.getEvents()).slice().reverse();
  await renderObserverDebug(events);

  if (events.length === 0) {
    const empty = createTextElement(
      "p",
      "event-list-empty",
      "No events yet. Your local activity will appear here.",
    );
    empty.setAttribute("role", "status");
    eventList.replaceChildren(empty);
    return;
  }

  const eventElements = events.map((event) => {
    const item = document.createElement("article");
    const timestamp = document.createElement("time");
    const title = createTextElement("h3", "", formatEventType(event.type));
    const metadata = formatEventMetadata(event);

    timestamp.dateTime = event.timestamp;
    timestamp.title = new Date(event.timestamp).toLocaleString();
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
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  showScreen(screenBeforeDebug);
  if (debugReturnFocus instanceof HTMLElement) {
    debugReturnFocus.focus();
  }
}

function showScreen(screenId) {
  let activeScreen = null;
  screens.forEach((screen) => {
    const isActive = screen.id === screenId;
    screen.hidden = !isActive;
    if (isActive) {
      activeScreen = screen;
    }
  });

  if (activeScreen) {
    activeScreen.scrollTop = 0;
  }
}

goalForm.addEventListener("input", renderSmartProgress);
goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const goalId = document.querySelector("#goal-id").value;
  const existingGoal = activeGoals.find(({ id }) => id === goalId);
  const activeCount = activeGoals.filter(({ status }) => status === "active").length;
  if (!existingGoal && activeCount >= 3) {
    goalFormError.textContent =
      "Pause or archive a goal before adding another active priority.";
    return;
  }
  const draft = goalFromForm(existingGoal);
  const validation = LockInGoals.validateGoalRecord(draft);
  if (!validation.valid) {
    goalFormError.textContent = validation.errors.join(" ");
    return;
  }

  if (existingGoal) {
    activeGoals = activeGoals.map((goal) =>
      goal.id === existingGoal.id ? validation.value : goal,
    );
  } else {
    activeGoals.push(validation.value);
  }
  await privateStorage.write(GOALS_STORAGE_KEY, activeGoals);
  await eventApi.record(
    existingGoal ? EventTypes.GOAL_UPDATED : EventTypes.GOAL_CREATED,
    {
      goalId: validation.value.id,
      area: validation.value.area,
      deadline: validation.value.deadline,
    },
  );
  if (
    existingGoal &&
    existingGoal.metric.current !== validation.value.metric.current
  ) {
    await eventApi.record(EventTypes.GOAL_PROGRESS_UPDATED, {
      goalId: validation.value.id,
      previous: existingGoal.metric.current,
      current: validation.value.metric.current,
      unit: validation.value.metric.unit,
    });
  }
  renderGoalList();
  goalForm.hidden = true;
  await CommandCenter();
});

newGoalButton.addEventListener("click", resetGoalForm);
cancelGoalButton.addEventListener("click", () => {
  goalForm.hidden = true;
  goalFormError.textContent = "";
});
openGoalsButton.addEventListener("click", () => {
  renderGoalList();
  if (activeGoals.length === 0) {
    resetGoalForm();
  } else {
    goalForm.hidden = true;
  }
  showScreen("goals-screen");
});
closeGoalsButton.addEventListener("click", async () => {
  await CommandCenter();
  showScreen("command-center-screen");
});

openWeeklyReviewButton.addEventListener("click", () => {
  const reviewGoal = document.querySelector("#review-goal");
  const options = activeGoals
    .filter(({ status }) => status === "active")
    .map((goal) => {
      const option = document.createElement("option");
      option.value = goal.id;
      option.textContent = goal.outcome;
      return option;
    });
  if (options.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Create an active goal first";
    options.push(option);
  }
  reviewGoal.replaceChildren(...options);
  const hasActiveGoal = options.some(({ value }) => value);
  [...weeklyReviewForm.elements].forEach((control) => {
    if (
      control !== reviewCreateGoalButton &&
      control !== closeWeeklyReviewButton
    ) {
      control.disabled = !hasActiveGoal;
    }
  });
  reviewCreateGoalButton.hidden = hasActiveGoal;
  saveWeeklyReviewButton.hidden = !hasActiveGoal;
  weeklyReviewStatus.hidden = true;
  showScreen("weekly-review-screen");
});
closeWeeklyReviewButton.addEventListener("click", async () => {
  await CommandCenter();
  showScreen("command-center-screen");
});
reviewCreateGoalButton.addEventListener("click", () => {
  renderGoalList();
  resetGoalForm();
  showScreen("goals-screen");
});
weeklyReviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const review = {
    id: globalThis.crypto?.randomUUID?.() ?? `review-${Date.now()}`,
    date: getDateKey(),
    goalId: getGoalFormValue("review-goal"),
    helped: getGoalFormValue("review-helped"),
    blocked: getGoalFormValue("review-blocked"),
    adjustment: getGoalFormValue("review-adjustment"),
    minimumPromise: getGoalFormValue("review-minimum"),
  };
  weeklyReviews = weeklyReviews.filter(({ date }) => date !== review.date);
  weeklyReviews.push(review);
  const reviewedGoal = activeGoals.find(({ id }) => id === review.goalId);
  if (reviewedGoal) {
    activeGoals = activeGoals.map((goal) =>
      goal.id === review.goalId
        ? {
            ...goal,
            actions: { ...goal.actions, minimum: review.minimumPromise },
            timestamps: {
              ...goal.timestamps,
              updatedAt: new Date().toISOString(),
            },
          }
        : goal,
    );
    await privateStorage.write(GOALS_STORAGE_KEY, activeGoals);
    await eventApi.record(EventTypes.GOAL_UPDATED, {
      goalId: review.goalId,
      source: "weekly-review",
      minimumAction: review.minimumPromise,
    });
  }
  await privateStorage.write(WEEKLY_REVIEWS_STORAGE_KEY, weeklyReviews);
  await eventApi.record(EventTypes.WEEKLY_REVIEW_COMPLETED, review);
  weeklyReviewStatus.textContent = "Saved. Next week uses the minimum you chose.";
  weeklyReviewStatus.hidden = false;
  await CommandCenter();
});

enterArcButton.addEventListener("click", () => {
  showScreen("identity-screen");
});
identityBackButton.addEventListener("click", () => {
  showScreen("landing-screen");
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
fixingBackButton.addEventListener("click", () => {
  showScreen("identity-screen");
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
blueprintBackButton.addEventListener("click", () => {
  showScreen("fixing-screen");
});

startArcButton.addEventListener("click", async () => {
  storage.writeJson(ONBOARDING_COMPLETE_STORAGE_KEY, true);
  eventApi.record(EventTypes.ONBOARDING_COMPLETED, {
    identities: [...selectedIdentities],
    attentionAreas: [...selectedAttentionAreas],
    obstacles: [...selectedObstacles],
  });
  if (activeGoals.length === 0) {
    renderGoalList();
    resetGoalForm();
    showScreen("goals-screen");
  } else {
    await CommandCenter();
    showScreen("command-center-screen");
  }
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

askCoachButton.addEventListener("click", askCoach);
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
  refreshAuditButton.textContent = "Refreshing…";

  try {
    await renderDailyAudit();
    refreshAuditButton.textContent = "Updated";
  } finally {
    setTimeout(() => {
      refreshAuditButton.textContent = "Refresh";
      refreshAuditButton.disabled = false;
    }, 900);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector("#event-debug-screen").hidden) {
    event.preventDefault();
    closeEventDebug();
    return;
  }
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

async function initializeApp() {
  const [storedGoals, storedHistory, storedReviews] = await Promise.all([
    privateStorage.read(GOALS_STORAGE_KEY, []),
    privateStorage.read(MISSION_HISTORY_STORAGE_KEY, []),
    privateStorage.read(WEEKLY_REVIEWS_STORAGE_KEY, []),
  ]);
  activeGoals = Array.isArray(storedGoals)
    ? storedGoals.map((goal) => LockInGoals.normalizeGoalRecord(goal))
    : [];
  missionHistory = Array.isArray(storedHistory) ? storedHistory : [];
  weeklyReviews = Array.isArray(storedReviews) ? storedReviews : [];

  renderArcState();
  renderIdentitySelections();
  renderStartingPoint();
  renderBlueprint();
  renderGoalList();

  if (storage.readJson(ONBOARDING_COMPLETE_STORAGE_KEY, false)) {
    await CommandCenter();
    showScreen("command-center-screen");
  }

  if (location.hash === "#events") {
    openEventDebug();
  }
}

initializeApp();

setInterval(renderArcState, 60 * 60 * 1000);
