// Runs inside every x.com tab. It holds the engine and answers messages from the
// popup: start a run, pause, resume, stop, and report status. The run lives here, in
// the tab, so it keeps going while the popup is closed — the popup just polls for
// status and sends controls. It also keeps a record of the run in storage (XRun) as it goes, so a
// run cut off by a reload can be continued from the popup. Nothing here talks to anything but x.com.
(() => {
  let lastSnapshot = { running: false, idle: true };
  let finished = null;
  // Archive items arrive in parts before "start" (see popup.js), since one message is capped.
  let staged = [];
  // The last run's settings, so "next batch" repeats it exactly, whatever the popup shows now.
  let lastConfig = null;
  let lastSettings = null; // the same, as the popup sent them, for the saved record
  let record = null; // the saved record of the current run (see run-state.js)
  let recordKey = null;

  function toConfig(raw) {
    return {
      source: raw.source,
      archiveItems: raw.staged ? staged : raw.archiveItems || [],
      types: raw.types,
      keepIds: new Set(raw.keepIds || []),
      keyword: raw.keyword || null,
      since: raw.since ? new Date(raw.since) : null,
      until: raw.until ? new Date(raw.until) : null,
      speed: XEngine.SPEEDS[raw.speed] || XEngine.SPEEDS.normal,
      limit: raw.limit === "all" ? Infinity : Number(raw.limit) || Infinity,
      resume: !!raw.resume,
      order: raw.order === "oldest" ? "oldest" : "newest",
      test: !!raw.test,
      handle: handle(),
    };
  }

  function begin(raw) {
    if (XEngine.isRunning()) return { ok: false, error: "already-running" };
    let cfg;
    try {
      cfg = toConfig(raw);
    } catch (e) {
      return { ok: false, error: "bad-config" };
    }
    staged = []; // the run holds its own reference now
    return run(cfg, XRun.settingsFrom(raw));
  }

  // The next batch: the same settings, skipping what the earlier batches already did.
  function next() {
    if (XEngine.isRunning()) return { ok: false, error: "already-running" };
    if (!lastConfig || lastConfig.test) return { ok: false, error: "no-previous-run" };
    return run({ ...lastConfig, resume: true }, lastSettings);
  }

  function run(cfg, settings) {
    finished = null;
    lastConfig = cfg;
    lastSettings = settings;
    const me = account();
    recordKey = me ? XRun.key(me) : null;
    record = { settings, status: "running", startedAt: Date.now(), deleted: 0, gone: 0, failures: 0, limitReached: false };
    saveRecord();
    XEngine.start(cfg, (snap) => {
      lastSnapshot = { ...snap, idle: false };
      // Counts change once per item: keep the record in step, so a reload loses nothing.
      if (snap.deleted !== record.deleted || snap.gone !== record.gone || snap.failures !== record.failures) {
        Object.assign(record, { deleted: snap.deleted, gone: snap.gone, failures: snap.failures });
        saveRecord();
      }
    }).then((final) => {
      finished = { ...final, idle: false };
      lastSnapshot = finished;
      Object.assign(record, {
        status: final.fatal ? "failed" : final.stopped ? "stopped" : "finished",
        deleted: final.deleted,
        gone: final.gone,
        failures: final.failures,
        limitReached: !!final.limitReached,
      });
      saveRecord();
    });
    return { ok: true };
  }

  function saveRecord() {
    if (!recordKey || !record) return;
    record.updatedAt = Date.now();
    chrome.storage.local.set({ [recordKey]: record }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      switch (msg && msg.type) {
        case "ping":
          sendResponse({ ok: true, signedIn: isSignedIn(), account: account(), profile: profilePath() });
          return;
        case "stage":
          if (msg.reset) staged = [];
          for (const it of msg.items || []) staged.push(it);
          sendResponse({ ok: true, count: staged.length });
          return;
        case "start":
          sendResponse(begin(msg.config));
          return;
        case "next":
          sendResponse(next());
          return;
        case "dismiss":
          // The popup moved on from the last result; reopening it starts at the setup.
          if (!XEngine.isRunning()) {
            finished = null;
            lastSnapshot = { running: false, idle: true };
            // Moving on from a full batch means no next batch. A stopped or failed run is still
            // offered to continue ("Stopped. You can continue later.").
            if (record && record.status === "finished") {
              record.status = "dismissed";
              saveRecord();
            }
          }
          sendResponse({ ok: true });
          return;
        case "pause":
          XEngine.pause();
          sendResponse({ ok: true });
          return;
        case "resume":
          XEngine.resume();
          sendResponse({ ok: true });
          return;
        case "stop":
          XEngine.stop();
          sendResponse({ ok: true });
          return;
        case "reset":
          XEngine.resetProgress().then(() => sendResponse({ ok: true }));
          return true; // async response
        case "status":
          sendResponse({ ok: true, running: XEngine.isRunning(), snapshot: lastSnapshot, finished });
          return;
        default:
          sendResponse({ ok: false, error: "unknown" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  });

  function isSignedIn() {
    try {
      XApi.userId();
      return true;
    } catch {
      return false;
    }
  }
  // The signed-in profile's path (/handle), from x.com's own navigation link, so the popup can
  // open it after a test run.
  function profilePath() {
    return document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href") || null;
  }
  // The signed-in @handle, kept with the history so it shows which account it belongs to.
  function handle() {
    return profilePath()?.replace(/^\//, "") || null;
  }
  function account() {
    try {
      return XApi.userId();
    } catch {
      return null;
    }
  }
})();
