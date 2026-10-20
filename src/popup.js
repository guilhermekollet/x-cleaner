// The popup: picks the x.com tab, reads the archive (when used), builds the run
// config, and drives the content script that does the work. It never touches x.com
// directly — it only sends messages to the tab and polls it for status.
const $ = (id) => document.getElementById(id);

let tabId = null;
let signedIn = false;
let archiveItems = null; // parsed items, when the archive source is used
let polling = null;

const els = {
  account: $("account"),
  controls: $("controls"),
  archiveRow: $("archiveRow"),
  archiveFile: $("archiveFile"),
  archiveSummary: $("archiveSummary"),
  start: $("start"),
  pause: $("pause"),
  resume: $("resume"),
  stop: $("stop"),
  progress: $("progress"),
  ack: $("ack"),
  test: $("test"),
  typeRow: $("typeRow"),
  confirmWord: $("confirmWord"),
};

function sourceValue() {
  return document.querySelector('input[name="source"]:checked').value;
}
function selectedTypes() {
  return { post: $("t-post").checked, reply: $("t-reply").checked, repost: $("t-repost").checked, like: $("t-like").checked };
}
function anyType() {
  return Object.values(selectedTypes()).some(Boolean);
}

async function send(type, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type, ...payload });
  } catch {
    return null; // content script not reachable (tab needs a reload)
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
    setAccount("out", "Open x.com in this tab and sign in, then reopen this popup.");
    disableAll();
    return;
  }
  tabId = tab.id;
  const pong = await send("ping");
  if (!pong) {
    setAccount("out", "Reload the x.com tab once (the extension was just installed), then reopen this popup.");
    disableAll();
    return;
  }
  signedIn = pong.signedIn;
  if (!signedIn) {
    setAccount("out", "You are on x.com but not signed in. Sign in and reopen this popup.");
    disableAll();
    return;
  }
  setAccount("in", "Signed in. This runs on the account open in this tab.");
  refreshStart();
  // If a run is already going (popup was reopened), jump straight to progress.
  const st = await send("status");
  if (st && st.running) enterRunning();
}

function setAccount(state, text) {
  els.account.dataset.state = state;
  els.account.textContent = text;
}
function disableAll() {
  els.start.disabled = true;
}

// --- Archive reading ---------------------------------------------------------
els.archiveFile.addEventListener("change", async () => {
  archiveItems = null;
  els.archiveSummary.textContent = "Reading…";
  try {
    const items = await XArchive.read(els.archiveFile.files);
    archiveItems = items;
    const by = { post: 0, reply: 0, repost: 0, like: 0 };
    for (const it of items) by[it.kind] = (by[it.kind] || 0) + 1;
    els.archiveSummary.textContent =
      `${items.length} items: ${by.post} posts, ${by.reply} replies, ${by.repost} reposts` +
      (by.like ? `, ${by.like} likes` : "");
  } catch (e) {
    els.archiveSummary.textContent = "Could not read that file. Pick the .zip, or the data/tweets*.js files.";
  }
  refreshStart();
});

// --- Enabling the Start button ----------------------------------------------
for (const id of ["ack", "test", "confirmWord", "t-post", "t-reply", "t-repost", "t-like"])
  $(id).addEventListener("input", refreshStart);
for (const r of document.querySelectorAll('input[name="source"]'))
  r.addEventListener("change", () => {
    els.archiveRow.classList.toggle("hidden", sourceValue() !== "archive");
    refreshStart();
  });
els.test.addEventListener("change", () => {
  els.typeRow.classList.toggle("hidden", els.test.checked);
  refreshStart();
});

function confirmed() {
  if (!els.ack.checked) return false;
  if (els.test.checked) return true; // a 5-item test needs only the acknowledgement
  return els.confirmWord.value.trim().toUpperCase() === "DELETE";
}

function refreshStart() {
  const ready =
    signedIn &&
    anyType() &&
    confirmed() &&
    (sourceValue() === "timeline" || (archiveItems && archiveItems.length));
  els.start.disabled = !ready;
}

// --- Running -----------------------------------------------------------------
function parseKeep() {
  return ($("f-keep").value || "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

els.start.addEventListener("click", async () => {
  const types = selectedTypes();
  if (types.like && sourceValue() === "timeline") types.like = false; // likes need the archive
  const config = {
    source: sourceValue(),
    archiveItems: sourceValue() === "archive" ? archiveItems : [],
    types,
    keyword: $("f-keyword").value.trim() || null,
    since: $("f-since").value ? new Date($("f-since").value).toISOString() : null,
    until: $("f-until").value ? new Date($("f-until").value + "T23:59:59").toISOString() : null,
    keepIds: parseKeep(),
    speed: $("speed").value,
    limit: els.test.checked ? 5 : "all",
    resume: $("resumePrev").checked,
  };
  const res = await send("start", { config });
  if (!res || !res.ok) {
    els.account.textContent = res && res.error === "already-running" ? "A run is already in progress." : "Could not start — reload the x.com tab and try again.";
    return;
  }
  enterRunning();
});

els.pause.addEventListener("click", async () => {
  await send("pause");
  els.pause.classList.add("hidden");
  els.resume.classList.remove("hidden");
});
els.resume.addEventListener("click", async () => {
  await send("resume");
  els.resume.classList.add("hidden");
  els.pause.classList.remove("hidden");
});
els.stop.addEventListener("click", async () => {
  await send("stop");
});

function enterRunning() {
  els.start.classList.add("hidden");
  els.pause.classList.remove("hidden");
  els.stop.classList.remove("hidden");
  els.progress.classList.remove("hidden");
  for (const el of els.controls.querySelectorAll("input, select, button#start")) el.disabled = true;
  if (!polling) polling = setInterval(poll, 1000);
  poll();
}

function exitRunning() {
  clearInterval(polling);
  polling = null;
  els.pause.classList.add("hidden");
  els.resume.classList.add("hidden");
  els.stop.classList.add("hidden");
}

async function poll() {
  const st = await send("status");
  if (!st) return;
  render(st.snapshot || {});
  if (!st.running && st.finished) {
    render(st.finished, true);
    exitRunning();
  }
}

function render(s, done) {
  $("p-deleted").textContent = s.deleted || 0;
  $("p-gone").textContent = s.gone || 0;
  $("p-failures").textContent = s.failures || 0;

  let msg;
  if (s.fatal) msg = "Stopped: " + friendlyFatal(s.fatal);
  else if (done) msg = s.stopped ? "Stopped. You can resume later." : "Done.";
  else if (s.waiting || s.waitUntil) msg = "X limited the pace — waiting " + secsUntil(s.waitUntil) + "s, then continuing.";
  else if (s.batchUntil) msg = "Batch pause — resuming in " + secsUntil(s.batchUntil) + "s.";
  else if (s.paused) msg = "Paused.";
  else msg = s.source === "archive" && s.total ? `Working… ${s.processed}/${s.total}.` : "Working…";
  $("p-status").textContent = msg;

  const bar = $("p-bar");
  if (s.source === "archive" && s.total) {
    bar.classList.remove("hidden");
    bar.max = s.total;
    bar.value = s.processed || 0;
  } else bar.classList.add("hidden");
}

function secsUntil(t) {
  return t ? Math.max(0, Math.round((t - Date.now()) / 1000)) : "…";
}
function friendlyFatal(f) {
  if (/404|endpoint/.test(f)) return "X changed its internal API. The extension needs an update — please open an issue.";
  if (/session|auth|403|401/.test(f)) return "X rejected the session. Reload x.com, make sure you're signed in, and try again.";
  return f;
}

init();
