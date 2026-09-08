importScripts("../core/event-engine.js", "../observer/browser-observer.js");

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

chrome.runtime.onStartup.addListener(() => {
  browserObserver.initialize({ discardPersisted: true });
});
