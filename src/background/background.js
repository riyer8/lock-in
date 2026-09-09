importScripts(
  "../core/event-engine.js",
  "../core/cue-engine.js",
  "../observer/browser-observer.js",
);

const NATIVE_HOST_NAME = "com.lockin.coach";

const eventPersistence = new LockInEvents.ChromeStorageEventAdapter(
  chrome.storage.local,
);
const eventStore = new LockInEvents.EventStore(eventPersistence);
const eventApi = new LockInEvents.EventApi(eventStore);
const observerState = new LockInBrowserObserver.ObserverStateStore(
  chrome.storage.local,
);
const browserObserver = new LockInBrowserObserver.BrowserObserver({
  tabs: chrome.tabs,
  windows: chrome.windows,
  eventApi,
  stateStore: observerState,
  eventTypes: LockInEvents.EventTypes,
});

browserObserver.initialize();

chrome.tabs.onActivated.addListener((activeInfo) => {
  browserObserver.handleTabActivated(activeInfo);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  browserObserver.handleTabUpdated(tabId, changeInfo, tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  browserObserver.handleTabRemoved(tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  browserObserver.handleWindowFocusChanged(windowId);
});

function ensureCoachBackend() {
  return chrome.runtime
    .sendNativeMessage(NATIVE_HOST_NAME, { action: "ensureRunning" })
    .catch((error) => ({
      ok: false,
      code: "NATIVE_HOST_UNAVAILABLE",
      error: error?.message || "Native host unavailable.",
    }));
}

const CUE_ALARM_NAME = "lock-in-hourly-cues";

async function loadCueSnapshot() {
  const keys = [LockInCues.CUES_STORAGE_KEY, LockInCues.CUE_STATE_STORAGE_KEY];
  const values = await chrome.storage.local.get(keys);
  const storedCues = values[LockInCues.CUES_STORAGE_KEY];
  const cues = LockInCues.normalizeCueCollection(storedCues ?? null);
  const state = LockInCues.ensureInitialized(values[LockInCues.CUE_STATE_STORAGE_KEY]);
  const writes = {};
  if (storedCues == null) writes[LockInCues.CUES_STORAGE_KEY] = cues;
  if (!values[LockInCues.CUE_STATE_STORAGE_KEY]?.initializedAt) {
    writes[LockInCues.CUE_STATE_STORAGE_KEY] = state;
  }
  if (Object.keys(writes).length) await chrome.storage.local.set(writes);
  return { cues, state };
}

async function syncDueCue() {
  const { cues, state } = await loadCueSnapshot();
  const due = LockInCues.chooseDueCue(cues, state);
  if (!due) return;
  if (state.pendingId !== due.id) {
    await chrome.storage.local.set({
      [LockInCues.CUE_STATE_STORAGE_KEY]: LockInCues.markPending(state, due.id),
    });
  }
  chrome.runtime.sendMessage({ type: "CUE_DUE", cue: due }).catch(() => {});
}

function ensureCueAlarm() {
  chrome.alarms.get(CUE_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(CUE_ALARM_NAME, { periodInMinutes: 1 });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CUE_ALARM_NAME) syncDueCue();
});

chrome.runtime.onStartup.addListener(() => {
  browserObserver.initialize({ discardPersisted: true });
  ensureCoachBackend();
  ensureCueAlarm();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureCoachBackend();
  ensureCueAlarm();
  loadCueSnapshot();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ENSURE_COACH_BACKEND") {
    return undefined;
  }

  ensureCoachBackend().then(sendResponse);
  return true;
});

ensureCueAlarm();

