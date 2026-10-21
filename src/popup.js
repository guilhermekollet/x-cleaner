// The popup: picks the x.com tab, reads the archive (when used), builds the run config, and
// drives the content script that does the work. It never touches x.com directly — it only sends
// messages to the tab and polls it for status. Copy comes from XI18n (English or Portuguese).
const $ = (id) => document.getElementById(id);
const { t } = XI18n;

// The page runs either as the toolbar popup or, for picking the archive file, in a tab of its
// own. In a tab, `?tab=` names the x.com tab it drives.
const pinnedTab = Number(new URLSearchParams(location.search).get("tab")) || null;
const inTab = pinnedTab !== null;

let tabId = null;
let signedIn = false;
let accountKey = "status.checking"; // last status message, re-rendered on a language change
let archiveItems = null; // parsed items, when the archive source is used
let archiveState = null; // "reading" | "error" | { total, by } — for re-rendering the summary
let lastRender = null; // last snapshot shown while running
let polling = null;
let profilePath = null; // the signed-in profile (/handle), for "View profile" after a test
let account = null; // the signed-in user id, for the history count

// "Test with 5 first" is a switch beside the confirmation: a test deletes 5 and stops, then offers
// the rest. It starts on until a test has passed once (remembered in storage), and is always one
// click away.
const TESTED_KEY = "xcleaner.tested";
let testPassed = false; // a test passed in this popup session: the full run continues from it
let lastRunWasTest = false;
const isTest = () => $("testFirst").checked;

const sourceValue = () => document.querySelector('input[name="source"]:checked').value;
const speedValue = () => document.querySelector('input[name="speed"]:checked').value;
const batchValue = () => $("batch").value || DEFAULT_BATCH; // a number as text, or "all"
const orderValue = () => ($("order").value === "oldest" ? "oldest" : "newest");

// How many a run deletes before it stops and offers the next batch, and in which order. These and
// the pace are remembered between openings.
const BATCHES = ["100", "250", "500", "1000", "2500", "all"];
const DEFAULT_BATCH = "500";
const PREFS_KEY = "xcleaner.prefs";
let prefs = { speed: "normal", batch: DEFAULT_BATCH, order: "newest" };
const selectedTypes = () => ({ post: $("t-post").checked, reply: $("t-reply").checked, repost: $("t-repost").checked, like: $("t-like").checked });

async function send(type, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type, ...payload });
  } catch {
    return null; // content script not reachable (tab needs a reload)
  }
}

// --- Language ----------------------------------------------------------------
XI18n.bindSwitch();
XI18n.onChange(renderText);

// Re-renders every piece of copy that depends on state, in the current language.
function renderText() {
  $("accountText").textContent = t(accountKey);
  renderOptions();
  $("start").textContent = startLabel();
  $("fullBanner").classList.toggle("hidden", !testPassed);
  renderSummary();
  refreshHistoryCount();
  if (lastRender) render(lastRender.s, lastRender.done);
}

// --- Setup -------------------------------------------------------------------
async function init() {
  document.body.classList.toggle("in-tab", inTab);
  // The file dialog works in a tab; from the popup, offer to continue there.
  $("pickInTab").classList.toggle("hidden", inTab);
  $("pickFile").classList.toggle("hidden", !inTab);
  XI18n.apply();
  renderText();
  await XI18n.load();
  try {
    const got = await chrome.storage.local.get([TESTED_KEY, PREFS_KEY]);
    if (got[TESTED_KEY]) $("testFirst").checked = false;
    prefs = { ...prefs, ...got[PREFS_KEY] };
  } catch {}
  applyPrefs();
  renderText();

  const tab = inTab
    ? await chrome.tabs.get(pinnedTab).catch(() => null)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) return setAccount("out", "status.notX");
  tabId = tab.id;
  const pong = await send("ping");
  if (!pong) return setAccount("out", "status.reload");
  signedIn = pong.signedIn;
  profilePath = pong.profile || null;
  account = pong.account || null;
  refreshHistoryCount();
  await refreshScanMeta();
  if (!signedIn) return setAccount("out", "status.signedOut");
  setAccount("in", "status.ready");
  refreshStart();
  // If a run is already going (the popup was reopened), go straight to progress. A run that ended
  // with a next step waiting (a passed test, a full batch) shows that result again.
  const st = await send("status");
  if (st && st.running) enterRunning();
  else if (st && st.finished && nextStepWaiting(st.finished)) {
    lastRunWasTest = !!st.finished.test;
    $("setup").classList.add("hidden");
    $("progress").classList.remove("hidden");
    render(st.finished, true);
    exitRunning(st.finished);
  }
}

function setAccount(state, key) {
  accountKey = key;
  $("account").dataset.state = state;
  $("accountText").textContent = t(key);
  refreshStart();
}

// --- History -------------------------------------------------------------------
// Opens the history in a tab, on this tab's account when we know it.
$("openHistory").addEventListener("click", async () => {
  const q = account ? `?account=${account}` : "";
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/history.html${q}`) });
  if (!inTab) window.close();
});

async function refreshHistoryCount() {
  if (!account) return;
  const meta = await XHistory.readMeta(account).catch(() => null);
  const n = meta?.count || 0;
  $("historyCount").classList.toggle("hidden", !n);
  $("historyCount").textContent = new Intl.NumberFormat(XI18n.locale).format(n);
}

// --- Archive reading -----------------------------------------------------------
$("pickInTab").addEventListener("click", async () => {
  if (tabId === null) return;
  await chrome.tabs.create({ url: chrome.runtime.getURL(`src/popup.html?tab=${tabId}`) });
  window.close();
});

$("archiveFile").addEventListener("change", async () => {
  archiveItems = null;
  archiveState = "reading";
  renderSummary();
  try {
    const items = await XArchive.read($("archiveFile").files);
    const by = { post: 0, reply: 0, repost: 0, like: 0 };
    for (const it of items) by[it.kind] = (by[it.kind] || 0) + 1;
    archiveItems = items;
    archiveState = { total: items.length, by };
  } catch {
    archiveState = "error";
  }
  renderSummary();
  refreshStart();
});

function renderSummary() {
  const box = $("archiveSummary");
  box.classList.toggle("hidden", !archiveState);
  if (!archiveState) return;
  if (archiveState === "reading") return void (box.innerHTML = `<span class="hint">${t("archive.reading")}</span>`);
  if (archiveState === "error") return void (box.innerHTML = `<span class="error">${t("archive.error")}</span>`);
  const fmt = new Intl.NumberFormat(XI18n.lang === "pt" ? "pt-BR" : "en-US");
  const tags = ["post", "reply", "repost", "like"]
    .filter((k) => archiveState.by[k])
    .map((k) => `<span class="tag"><b>${fmt.format(archiveState.by[k])}</b> ${t("types." + k)}</span>`)
    .join("");
  box.innerHTML = `<span class="total">${t("archive.items", { n: fmt.format(archiveState.total) })}</span>${tags}`;
}

// --- Batch size, order and pace ------------------------------------------------------
// The selects are filled here so their options follow the language.
function renderOptions() {
  const fmt = new Intl.NumberFormat(XI18n.locale);
  const fill = (select, options) => {
    const value = select.value;
    select.replaceChildren(...options.map(([v, label]) => new Option(label, v)));
    if (value) select.value = value;
  };
  fill($("batch"), BATCHES.map((b) => [b, b === "all" ? t("batch.all") : t("batch.size", { n: fmt.format(Number(b)) })]));
  fill($("order"), [["newest", t("order.newest")], ["oldest", t("order.oldest")]]);
}

function applyPrefs() {
  renderOptions();
  $("batch").value = BATCHES.includes(String(prefs.batch)) ? String(prefs.batch) : DEFAULT_BATCH;
  $("order").value = prefs.order === "oldest" ? "oldest" : "newest";
  const speed = document.querySelector(`input[name="speed"][value="${prefs.speed}"]`);
  if (speed) speed.checked = true;
}

function savePrefs() {
  prefs = { speed: speedValue(), batch: batchValue(), order: orderValue() };
  chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
}

for (const id of ["batch", "order"]) $(id).addEventListener("change", () => {
  savePrefs();
  renderText();
  refreshStart();
});
for (const r of document.querySelectorAll('input[name="speed"]')) r.addEventListener("change", savePrefs);

// Oldest first without the archive reads the whole profile first. A read from the last day is kept
// (see engine.js); when it covers the chosen types, the Recent card says the run starts at once.
let scanMeta = null;
async function refreshScanMeta() {
  if (!account) return;
  const key = "xcleaner.scanmeta." + account;
  scanMeta = (await chrome.storage.local.get(key).catch(() => ({})))[key] || null;
  refreshStart();
}
function scanReady() {
  if (!scanMeta || Date.now() - scanMeta.at > 24 * 60 * 60 * 1000 || !scanMeta.count) return false;
  const types = selectedTypes();
  const needed = [];
  if (types.post || types.repost) needed.push("UserTweets");
  if (types.reply) needed.push("UserRepliesTimeline");
  return needed.every((op) => scanMeta.done.includes(op));
}

// The main button says exactly what a click will do.
function startLabel() {
  if (isTest()) return t("start.test");
  const oldest = orderValue() === "oldest";
  const batch = batchValue();
  if (batch === "all") return t(oldest ? "start.allOldest" : "start.all");
  return t(oldest ? "start.batchOldest" : "start.batchNewest", { n: new Intl.NumberFormat(XI18n.locale).format(Number(batch)) });
}

// --- Enabling Start --------------------------------------------------------------
for (const id of ["t-post", "t-reply", "t-repost", "t-like"]) $(id).addEventListener("input", refreshStart);
for (const r of document.querySelectorAll('input[name="source"]')) r.addEventListener("change", refreshStart);
$("testFirst").addEventListener("change", () => {
  renderText();
  refreshStart();
});

function refreshStart() {
  const archive = sourceValue() === "archive";
  // In the toolbar popup the archive run is set up in a tab, so the popup keeps only the picker.
  document.body.classList.toggle("archive-mode", archive);
  $("archiveRow").classList.toggle("hidden", !archive);
  $("likeHint").classList.toggle("hidden", !($("t-like").checked && !archive));
  const oldest = orderValue() === "oldest";
  // Oldest first without the archive reaches only what the profile lists; the Recent card says so.
  const hintKey = !oldest ? "source.timelineHint" : scanReady() ? "source.timelineHintReady" : "source.timelineHintOldest";
  $("timelineHint").dataset.i18n = hintKey;
  $("timelineHint").textContent = t(hintKey);
  document.querySelector(".order-newest").classList.toggle("hidden", oldest);
  document.querySelector(".order-oldest").classList.toggle("hidden", !oldest);
  const types = selectedTypes();
  const anyType = archive ? Object.values(types).some(Boolean) : types.post || types.reply || types.repost;
  const ready = signedIn && anyType && (!archive || (archiveItems && archiveItems.length));
  $("start").disabled = !ready;
}

// --- Running -------------------------------------------------------------------
// Archive items go to the tab in parts: they carry the full text and media for the history, and
// Chrome caps one message at 64 MB, which a very large archive would exceed in one go.
const STAGE_SIZE = 5000;
async function stageArchive(items) {
  for (let i = 0; i < items.length; i += STAGE_SIZE) {
    const res = await send("stage", { reset: i === 0, items: items.slice(i, i + STAGE_SIZE) });
    if (!res || !res.ok) return false;
  }
  return true;
}

const parseKeep = () => ($("f-keep").value || "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

$("start").addEventListener("click", async () => {
  const types = selectedTypes();
  if (types.like && sourceValue() === "timeline") types.like = false; // likes need the archive
  const config = {
    source: sourceValue(),
    staged: sourceValue() === "archive",
    types,
    keyword: $("f-keyword").value.trim() || null,
    since: $("f-since").value ? new Date($("f-since").value).toISOString() : null,
    until: $("f-until").value ? new Date($("f-until").value + "T23:59:59").toISOString() : null,
    keepIds: parseKeep(),
    speed: speedValue(),
    limit: isTest() ? 5 : batchValue(),
    test: isTest(),
    order: orderValue(),
    // After a test, the full run skips what the test already removed.
    resume: $("resumePrev").checked || testPassed,
  };
  lastRunWasTest = isTest();
  if (config.staged && !(await stageArchive(archiveItems))) return setAccount("out", "run.couldNotStart");
  const res = await send("start", { config });
  if (!res || !res.ok) return setAccount("out", res && res.error === "already-running" ? "run.alreadyRunning" : "run.couldNotStart");
  enterRunning();
});

$("pause").addEventListener("click", async () => {
  await send("pause");
  $("pause").classList.add("hidden");
  $("resume").classList.remove("hidden");
});
$("resume").addEventListener("click", async () => {
  await send("resume");
  $("resume").classList.add("hidden");
  $("pause").classList.remove("hidden");
});
$("stop").addEventListener("click", () => send("stop"));
function backToSetup() {
  lastRender = null;
  send("dismiss");
  $("progress").classList.add("hidden");
  $("setup").classList.remove("hidden");
  for (const id of ["pause", "stop"]) $(id).classList.remove("hidden");
  for (const id of ["again", "viewProfile", "continueFull", "nextBatch"]) $(id).classList.add("hidden");
  renderText();
  refreshStart();
}
$("again").addEventListener("click", backToSetup);

// After a test: look at the profile, then continue with the rest.
$("viewProfile").addEventListener("click", async () => {
  if (tabId === null) return;
  await chrome.tabs.update(tabId, { url: `${new URL("https://x.com")}${(profilePath || "/home").replace(/^\//, "")}`, active: true });
});
// After a full batch: the same settings again, skipping what is already done. The tab keeps the
// settings, so this works even when the popup was closed and reopened during the run.
$("nextBatch").addEventListener("click", async () => {
  lastRunWasTest = false;
  const res = await send("next");
  if (!res || !res.ok) return setAccount("out", res && res.error === "already-running" ? "run.alreadyRunning" : "run.couldNotStart");
  enterRunning();
});

$("continueFull").addEventListener("click", () => {
  testPassed = true;
  $("testFirst").checked = false;
  backToSetup();
  $("start").focus();
});

function enterRunning() {
  $("setup").classList.add("hidden");
  $("progress").classList.remove("hidden");
  for (const id of ["pause", "stop"]) $(id).classList.remove("hidden");
  for (const id of ["resume", "again", "viewProfile", "continueFull", "nextBatch"]) $(id).classList.add("hidden");
  if (!polling) polling = setInterval(poll, 1000);
  poll();
}

function exitRunning(final) {
  clearInterval(polling);
  polling = null;
  for (const id of ["pause", "resume", "stop"]) $(id).classList.add("hidden");
  // A test that went through offers the next step; anything else offers a new run.
  const testOk = lastRunWasTest && final && !final.fatal && !final.stopped;
  const more = batchFull(final);
  $("again").classList.toggle("hidden", testOk);
  // Beside "Next batch", "New run" steps back to an outline button.
  $("again").classList.toggle("btn-solid", !more);
  $("again").classList.toggle("btn-block", !more);
  $("again").classList.toggle("btn-outline", more);
  $("nextBatch").classList.toggle("hidden", !more);
  $("viewProfile").classList.toggle("hidden", !testOk);
  $("continueFull").classList.toggle("hidden", !testOk);
  if (testOk) chrome.storage.local.set({ [TESTED_KEY]: true }).catch(() => {});
  refreshHistoryCount();
  refreshScanMeta();
}

async function poll() {
  const st = await send("status");
  if (!st) return;
  if (!st.running && st.finished) {
    render(st.finished, true);
    exitRunning(st.finished);
  } else render(st.snapshot || {}, false);
}

function render(s, done) {
  lastRender = { s, done };
  const fmt = new Intl.NumberFormat(XI18n.lang === "pt" ? "pt-BR" : "en-US");
  $("p-deleted").textContent = fmt.format(s.deleted || 0);
  $("p-gone").textContent = fmt.format(s.gone || 0);
  $("p-failures").textContent = fmt.format(s.failures || 0);
  $("p-failures").classList.toggle("has", (s.failures || 0) > 0);

  // Progress counts this run only, so a resumed run starts from zero against what is left.
  const acted = (s.deleted || 0) + (s.gone || 0) + (s.failures || 0);
  const hasTotal = s.total > 0;
  // While reading the profile, progress is against its post count (X lists at most ~3,200).
  const scanOf = s.scanTotal ? Math.min(s.scanTotal, PROFILE_LIMIT) : 0;
  const scanKnown = s.scanning && scanOf > 0 && (s.found || 0) <= scanOf;
  const read = fmt.format(s.found || 0);

  let msg;
  if (s.fatal) msg = t("run.stoppedWith", { reason: friendlyFatal(s.fatal) });
  else if (done && lastRunWasTest && !s.stopped) msg = t("testDone.text", { n: fmt.format((s.deleted || 0) + (s.gone || 0)) });
  else if (done && batchFull(s)) {
    msg = t("run.batchDone", { n: fmt.format((s.deleted || 0) + (s.gone || 0)) });
    if (hasTotal && s.total > acted) msg += " " + t("run.left", { n: fmt.format(s.total - acted) });
  } else if (done && s.stopped && s.scanning) msg = t("run.stoppedScan", { n: read });
  else if (done) msg = s.stopped ? t("run.stopped") : t("run.done");
  // A wait for X comes first: it explains why nothing moves, and for how long.
  else if (s.waitUntil || s.waiting)
    msg = s.scanning ? t("run.scanLimited", { time: waitText(s.waitUntil), n: read }) : t("run.limited", { time: waitText(s.waitUntil) });
  else if (s.batchUntil) msg = t("run.batch", { time: waitText(s.batchUntil) });
  else if (s.paused) msg = t("run.paused");
  else if (s.scanning) msg = scanKnown ? t("run.scanningOf", { n: read, total: fmt.format(scanOf) }) : t("run.scanning", { n: read });
  else msg = hasTotal ? `${t("run.working")} ${t("run.progress", { done: fmt.format(acted), total: fmt.format(s.total) })}` : t("run.working");
  // The history is the only copy of what was deleted; say so if any of it couldn't be saved.
  if (s.historyErrors) msg += " " + t("run.historyErrors", { n: fmt.format(s.historyErrors) });
  $("p-status").textContent = msg;
  refreshHistoryCount();

  const bar = $("p-bar");
  // A full batch isn't the end: the bar keeps showing how much of the total is done.
  bar.classList.toggle("done", !!done && !s.fatal && !s.stopped && !batchFull(s));
  bar.classList.toggle("indeterminate", !done && !hasTotal && !scanKnown);
  bar.firstElementChild.style.width = scanKnown
    ? `${Math.min(98, ((s.found || 0) / scanOf) * 100)}%`
    : hasTotal
      ? `${Math.min(100, (acted / s.total) * 100)}%`
      : "";
}

const PROFILE_LIMIT = 3200; // about how far back X lists a profile

// A run that stopped because its batch filled up, not because it ran out, was stopped or failed.
const batchFull = (s) => !!s && !lastRunWasTest && !s.test && !!s.limitReached && !s.fatal && !s.stopped;
const nextStepWaiting = (s) => !s.fatal && !s.stopped && (s.test || batchFull(s));

// "45s" for a short wait, "~13 min" for a long one (X's limits reset every 15 minutes).
function waitText(ts) {
  if (!ts) return "…";
  const secs = Math.max(0, Math.round((ts - Date.now()) / 1000));
  return secs < 90 ? t("time.secs", { n: secs }) : t("time.mins", { n: Math.ceil(secs / 60) });
}

function friendlyFatal(f) {
  if (/404|endpoint/.test(f)) return t("run.fatalApi");
  if (/session|auth|403|401/.test(f)) return t("run.fatalSession");
  return f;
}

init();
