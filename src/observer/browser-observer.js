(function initializeBrowserObserver(globalScope) {
  /*
   * LOCK IN Browser Observer V0.8 observes active website domains and active
   * time only.
   *
   * It does not inspect page contents, keystrokes, forms, passwords, cookies,
   * screenshots, or message contents.
   */

  const OBSERVER_STATE_KEY = "lock-in-browser-observer-state";
  const MAX_TRUSTED_SESSION_MS = 12 * 60 * 60 * 1000;
  const BROWSER_SESSION_EVENT = "BROWSER_SITE_SESSION";

  function getHostnameFromUrl(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return null;
      }

      return parsedUrl.hostname.toLowerCase().replace(/^www\./, "") || null;
    } catch {
      return null;
    }
  }

  function calculateSessionDuration(startTime, endTime) {
    const duration = new Date(endTime).getTime() - new Date(startTime).getTime();
    return Number.isFinite(duration) ? Math.max(0, duration) : 0;
  }

  function getBrowserSessionsForDate(events, date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    return events.filter((event) => {
      if (event.type !== BROWSER_SESSION_EVENT) {
        return false;
      }
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime >= start.getTime() && eventTime <= end.getTime();
    });
  }

  function getBrowserTimeByDomain(events, date) {
    const totals = new Map();
    getBrowserSessionsForDate(events, date).forEach((event) => {
      const { domain, durationMs } = event.metadata;
      if (!domain || !Number.isFinite(durationMs)) {
        return;
      }
      totals.set(domain, (totals.get(domain) ?? 0) + durationMs);
    });

    return [...totals.entries()]
      .map(([domain, durationMs]) => ({ domain, durationMs }))
      .sort((first, second) => second.durationMs - first.durationMs);
  }

  class ObserverStateStore {
    constructor(storageArea, storageKey = OBSERVER_STATE_KEY) {
      this.storage = storageArea;
      this.storageKey = storageKey;
    }

    async get() {
      try {
        const result = await this.storage.get(this.storageKey);
        return result[this.storageKey] ?? null;
      } catch (error) {
        console.error("LOCK IN observer state retrieval failed", error);
        return null;
      }
    }

    async set(session) {
      try {
        await this.storage.set({ [this.storageKey]: session });
        return true;
      } catch (error) {
        console.error("LOCK IN observer state persistence failed", error);
        return false;
      }
    }

    async clear() {
      try {
        await this.storage.remove(this.storageKey);
        return true;
      } catch (error) {
        console.error("LOCK IN observer state clearing failed", error);
        return false;
      }
    }
  }

  class BrowserObserver {
    constructor({
      tabs,
      windows,
      eventApi,
      stateStore,
      eventTypes,
      now = () => new Date(),
    }) {
      this.tabs = tabs;
      this.windows = windows;
      this.eventApi = eventApi;
      this.stateStore = stateStore;
      this.eventTypes = eventTypes;
      this.now = now;
      this.currentSession = null;
      this.focusedWindowId = null;
      this.pendingTransition = Promise.resolve();
    }

    enqueue(action) {
      this.pendingTransition = this.pendingTransition
        .then(action)
        .catch((error) => console.error("LOCK IN browser observation failed", error));
      return this.pendingTransition;
    }

    async initialize({ discardPersisted = false } = {}) {
      return this.enqueue(async () => {
        const persistedSession = discardPersisted
          ? null
          : await this.stateStore.get();

        if (discardPersisted) {
          this.currentSession = null;
          await this.stateStore.clear();
        }

        const focusedWindow = await this.windows.getLastFocused();
        if (!focusedWindow?.focused) {
          this.currentSession = null;
          await this.stateStore.clear();
          return;
        }

        this.focusedWindowId = focusedWindow.id;
        const [activeTab] = await this.tabs.query({
          active: true,
          windowId: focusedWindow.id,
        });
        const domain = getHostnameFromUrl(activeTab?.url);

        if (this.canResume(persistedSession, activeTab, domain)) {
          this.currentSession = persistedSession;
          return;
        }

        await this.stateStore.clear();
        await this.startSession(activeTab, domain);
      });
    }

    canResume(session, tab, domain) {
      if (!session || !tab || tab.incognito || !domain) {
        return false;
      }

      const age = this.now().getTime() - new Date(session.startTime).getTime();
      return (
        age >= 0 &&
        age <= MAX_TRUSTED_SESSION_MS &&
        session.tabId === tab.id &&
        session.windowId === tab.windowId &&
        session.domain === domain
      );
    }

    handleTabActivated(activeInfo) {
      return this.enqueue(async () => {
        const window = await this.windows.get(activeInfo.windowId);
        if (!window?.focused) {
          return;
        }

        this.focusedWindowId = activeInfo.windowId;
        const tab = await this.tabs.get(activeInfo.tabId);
        await this.transitionToTab(tab, {
          forceBoundary: this.currentSession?.tabId !== tab.id,
        });
      });
    }

    handleTabUpdated(tabId, changeInfo, tab) {
      if (!changeInfo.url || !tab.active) {
        return Promise.resolve();
      }

      return this.enqueue(async () => {
        if (tab.windowId !== this.focusedWindowId) {
          return;
        }
        if (this.currentSession && this.currentSession.tabId !== tabId) {
          return;
        }
        await this.transitionToTab(tab);
      });
    }

    handleWindowFocusChanged(windowId) {
      return this.enqueue(async () => {
        if (windowId === this.windows.WINDOW_ID_NONE) {
          this.focusedWindowId = null;
          await this.endCurrentSession();
          return;
        }

        const changedWindow = this.currentSession?.windowId !== windowId;
        this.focusedWindowId = windowId;
        const [activeTab] = await this.tabs.query({
          active: true,
          windowId,
        });
        await this.transitionToTab(activeTab, {
          forceBoundary: changedWindow,
        });
      });
    }

    handleTabRemoved(tabId) {
      return this.enqueue(async () => {
        if (this.currentSession?.tabId === tabId) {
          await this.endCurrentSession();
        }
      });
    }

    async transitionToTab(tab, { forceBoundary = false } = {}) {
      const domain = tab?.incognito ? null : getHostnameFromUrl(tab?.url);
      const isSameSession =
        this.currentSession?.tabId === tab?.id &&
        this.currentSession?.domain === domain;

      if (isSameSession && !forceBoundary) {
        return;
      }

      await this.endCurrentSession();
      await this.startSession(tab, domain);
    }

    async startSession(tab, domain) {
      if (!tab || tab.incognito || !domain) {
        return;
      }

      const startTime = this.now().toISOString();
      this.currentSession = {
        id:
          globalScope.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        domain,
        startTime,
        tabId: tab.id,
        windowId: tab.windowId,
        source: "browser",
      };
      await this.stateStore.set(this.currentSession);
    }

    async endCurrentSession() {
      const session = this.currentSession;
      if (!session) {
        return;
      }

      this.currentSession = null;
      const endTime = this.now().toISOString();
      const durationMs = calculateSessionDuration(session.startTime, endTime);
      await this.stateStore.clear();
      await this.eventApi.record(
        this.eventTypes.BROWSER_SITE_SESSION,
        {
          sessionId: session.id,
          domain: session.domain,
          startTime: session.startTime,
          endTime,
          durationMs,
        },
        "browser",
        endTime,
      );
    }
  }

  const browserObserver = {
    OBSERVER_STATE_KEY,
    BrowserObserver,
    ObserverStateStore,
    getHostnameFromUrl,
    calculateSessionDuration,
    getBrowserSessionsForDate,
    getBrowserTimeByDomain,
  };

  globalScope.LockInBrowserObserver = browserObserver;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = browserObserver;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
