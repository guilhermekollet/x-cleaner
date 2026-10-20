// Runs inside every x.com tab. It holds the engine and answers messages from the
// popup: start a run, pause, resume, stop, and report status. The run lives here, in
// the tab, so it keeps going while the popup is closed — the popup just polls for
// status and sends controls. Nothing here talks to anything but x.com.
(() => {
  let lastSnapshot = { running: false, idle: true };
  let finished = null;

  function toConfig(raw) {
    return {
      source: raw.source,
      archiveItems: raw.archiveItems || [],
      types: raw.types,
      keepIds: new Set(raw.keepIds || []),
      keyword: raw.keyword || null,
      since: raw.since ? new Date(raw.since) : null,
      until: raw.until ? new Date(raw.until) : null,
      speed: XEngine.SPEEDS[raw.speed] || XEngine.SPEEDS.normal,
      limit: raw.limit === "all" ? Infinity : Number(raw.limit) || Infinity,
      resume: !!raw.resume,
    };
  }

  function begin(raw) {
    if (XEngine.isRunning()) return { ok: false, error: "already-running" };
    finished = null;
    let cfg;
    try {
      cfg = toConfig(raw);
    } catch (e) {
      return { ok: false, error: "bad-config" };
    }
    XEngine.start(cfg, (snap) => {
      lastSnapshot = { ...snap, idle: false };
    }).then((final) => {
      finished = { ...final, idle: false };
      lastSnapshot = finished;
    });
    return { ok: true };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      switch (msg && msg.type) {
        case "ping":
          sendResponse({ ok: true, signedIn: isSignedIn(), account: account() });
          return;
        case "start":
          sendResponse(begin(msg.config));
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
  function account() {
    try {
      return XApi.userId();
    } catch {
      return null;
    }
  }
})();
