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

  return { key, settingsFrom, offer, continueConfig };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XRun;
