(function initializeDayClock(globalScope) {
  const MS_PER_MINUTE = 60 * 1000;
  const MS_PER_HOUR = 60 * MS_PER_MINUTE;

  function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  function describeYearCountdown(date = new Date()) {
    const today = startOfDay(date);
    const year = today.getFullYear();
    const newYear = new Date(year + 1, 0, 1);
    const daysLeft = Math.round((newYear.getTime() - today.getTime()) / (24 * MS_PER_HOUR));
    return {
      year,
      nextYear: year + 1,
      daysLeft,
      isLastDay: daysLeft === 1,
    };
  }

  function describeDayProgress(date = new Date()) {
    const start = startOfDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const lengthMs = end.getTime() - start.getTime();
    const elapsedMs = Math.min(lengthMs, Math.max(0, date.getTime() - start.getTime()));
    const remainingMs = lengthMs - elapsedMs;
    const percent = Math.min(100, Math.max(0, Math.round((elapsedMs / lengthMs) * 100)));
    const hours = Math.floor(remainingMs / MS_PER_HOUR);
    const minutes = Math.floor((remainingMs % MS_PER_HOUR) / MS_PER_MINUTE);
    return {
      percent,
      fraction: elapsedMs / lengthMs,
      remainingMs,
      remaining: hours ? `${hours}h ${minutes}m left` : `${minutes}m left`,
    };
  }

  function summarizeBrowserDomains(domains, limit = 5) {
    const list = Array.isArray(domains) ? domains : [];
    const totalMs = list.reduce((sum, item) => sum + (Number(item?.durationMs) || 0), 0);
    const top = list.slice(0, limit);
    const restMs = list.slice(limit).reduce((sum, item) => sum + (Number(item?.durationMs) || 0), 0);
    const rows = top.map(({ domain, durationMs }) => ({
      domain,
      durationMs,
      share: totalMs ? durationMs / totalMs : 0,
    }));
    if (restMs > 0) {
      rows.push({
        domain: `${list.length - limit} more`,
        durationMs: restMs,
        share: restMs / totalMs,
        isRest: true,
      });
    }
    return { totalMs, rows };
  }

  const dayClock = {
    describeYearCountdown,
    describeDayProgress,
    summarizeBrowserDomains,
  };

  globalScope.LockInClock = dayClock;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = dayClock;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
