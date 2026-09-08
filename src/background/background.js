importScripts("../core/event-engine.js", "../observer/browser-observer.js");

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

chrome.runtime.onStartup.addListener(() => {
  browserObserver.initialize({ discardPersisted: true });
  ensureCoachBackend();
});

chrome.runtime.onInstalled.addListener(() => {
  ensureCoachBackend();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ENSURE_COACH_BACKEND") {
    return undefined;
  }

  ensureCoachBackend().then(sendResponse);
  return true;
});
