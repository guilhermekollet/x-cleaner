// The last run, kept in the browser so a run cut off by a reload, or by closing the x.com tab, can
// be picked up again from the popup. The x.com tab writes it as the run goes (content.js); the
// popup reads it to offer "Continue" or "Next batch" (popup.js). One record per account:
//   xcleaner.run.<userId>  { settings, status, startedAt, updatedAt, deleted, gone, failures, limitReached }
// `status` is "running" while the tab works on it, then "finished", "stopped" (by the user) or
// "failed"; "dismissed" once the user moves on. A record still "running" when no tab is running it
// means the run was interrupted.
globalThis.XRun = (() => {
  const key = (me) => "xcleaner.run." + me;

  // The settings worth keeping: everything the popup sent for the run, minus the archive items
  // (large, and the file can be read again) and the one-off resume flag.
  function settingsFrom(raw) {
    const { archiveItems, resume, ...settings } = raw || {};
    return settings;
  }

  // What the popup can offer for a saved run, or null: continue an interrupted, stopped or failed
  // run, or start the next batch after a full one. A test is never continued (its next step is the
  // full run), and a run still going in another tab is left alone.
  function offer(record, { activeElsewhere = false } = {}) {
    if (!record || !record.settings || record.settings.test) return null;
    const n = (record.deleted || 0) + (record.gone || 0);
    switch (record.status) {
      case "running":
        return activeElsewhere ? null : { kind: "interrupted", n };
      case "stopped":
        return { kind: "stopped", n };
      case "failed":
        return { kind: "failed", n };
      case "finished":
        return record.limitReached ? { kind: "batch", n } : null;
      default:
        return null;
    }
  }

  // The config to continue with: the saved settings, skipping what earlier runs already did.
  function continueConfig(record) {
    return { ...record.settings, resume: true, test: false };
  }

  // The "Keep these IDs" field: ids, or links to posts (x.com/…/status/123, twitter.com too), in
  // any mix of spaces, commas and lines. A link's id is the number after /status/.
  function parseKeepIds(text) {
    const ids = [];
    for (const token of String(text || "").split(/[\s,;]+/)) {
      const id = token.match(/\/status(?:es)?\/(\d+)/)?.[1] || (/^\d+$/.test(token) ? token : null);
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  // The date filter, from the two <input type="date"> values ("YYYY-MM-DD"), in the browser's own
  // time zone: from the start of the first day to the start of the day after the last one.
  function dateBounds(since, until) {
    const day = (v, add = 0) => {
      const [y, m, d] = v.split("-").map(Number);
      return new Date(y, m - 1, d + add).toISOString();
    };
    return { since: since ? day(since) : null, until: until ? day(until, 1) : null };
  }

  return { key, settingsFrom, offer, continueConfig, parseKeepIds, dateBounds };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XRun;
