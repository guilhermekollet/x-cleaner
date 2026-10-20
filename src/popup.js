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

// The test comes first: a run deletes 5 and stops, then offers the rest. It is skipped once a test
// has passed (this session or before, remembered in storage) or when "Skip the test" is ticked.
const TESTED_KEY = "xcleaner.tested";
let testPassed = false; // a test passed in this popup session: the full run continues from it
let lastRunWasTest = false;
const isTest = () => !testPassed && !$("skipTest").checked;

const sourceValue = () => document.querySelector('input[name="source"]:checked').value;
const speedValue = () => document.querySelector('input[name="speed"]:checked').value;
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
  $("typeLabel").textContent = t("confirm.type", { word: t("confirm.word") });
  $("start").textContent = isTest() ? t("start.test") : t("start.all");
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
    if ((await chrome.storage.local.get(TESTED_KEY))[TESTED_KEY]) $("skipTest").checked = true;
  } catch {}
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
  if (!signedIn) return setAccount("out", "status.signedOut");
  setAccount("in", "status.ready");
  refreshStart();
  // If a run is already going (the popup was reopened), go straight to progress.
  const st = await send("status");
  if (st && st.running) enterRunning();
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

// --- Enabling Start --------------------------------------------------------------
for (const id of ["ack", "confirmWord", "t-post", "t-reply", "t-repost", "t-like"]) $(id).addEventListener("input", refreshStart);
for (const r of document.querySelectorAll('input[name="source"]')) r.addEventListener("change", refreshStart);
$("skipTest").addEventListener("change", () => {
  renderText();
  refreshStart();
});

function confirmed() {
  if (!$("ack").checked) return false;
  if (isTest()) return true; // a 5-item test needs only the acknowledgement
  return XI18n.confirmWords().includes($("confirmWord").value.trim().toUpperCase());
}

function refreshStart() {
  const archive = sourceValue() === "archive";
  // In the toolbar popup the archive run is set up in a tab, so the popup keeps only the picker.
  document.body.classList.toggle("archive-mode", archive);
  $("archiveRow").classList.toggle("hidden", !archive);
  $("typeRow").classList.toggle("hidden", isTest());
  $("likeHint").classList.toggle("hidden", !($("t-like").checked && !archive));
  const types = selectedTypes();
  const anyType = archive ? Object.values(types).some(Boolean) : types.post || types.reply || types.repost;
  const ready = signedIn && anyType && confirmed() && (!archive || (archiveItems && archiveItems.length));
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
    limit: isTest() ? 5 : "all",
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
  $("progress").classList.add("hidden");
  $("setup").classList.remove("hidden");
  for (const id of ["pause", "stop"]) $(id).classList.remove("hidden");
  for (const id of ["again", "viewProfile", "continueFull"]) $(id).classList.add("hidden");
  renderText();
  refreshStart();
}
$("again").addEventListener("click", backToSetup);

// After a test: look at the profile, then continue with the rest.
$("viewProfile").addEventListener("click", async () => {
  if (tabId === null) return;
  await chrome.tabs.update(tabId, { url: `${new URL("https://x.com")}${(profilePath || "/home").replace(/^\//, "")}`, active: true });
});
$("continueFull").addEventListener("click", () => {
  testPassed = true;
  backToSetup();
  $("confirmWord").focus();
});

function enterRunning() {
  $("setup").classList.add("hidden");
  $("progress").classList.remove("hidden");
  for (const id of ["pause", "stop"]) $(id).classList.remove("hidden");
  for (const id of ["resume", "again", "viewProfile", "continueFull"]) $(id).classList.add("hidden");
  if (!polling) polling = setInterval(poll, 1000);
  poll();
}

function exitRunning(final) {
  clearInterval(polling);
  polling = null;
  for (const id of ["pause", "resume", "stop"]) $(id).classList.add("hidden");
  // A test that went through offers the next step; anything else offers a new run.
  const testOk = lastRunWasTest && final && !final.fatal && !final.stopped;
  $("again").classList.toggle("hidden", testOk);
  $("viewProfile").classList.toggle("hidden", !testOk);
  $("continueFull").classList.toggle("hidden", !testOk);
  if (testOk) chrome.storage.local.set({ [TESTED_KEY]: true }).catch(() => {});
  refreshHistoryCount();
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
  const hasTotal = s.source === "archive" && s.total > 0;

  let msg;
  if (s.fatal) msg = t("run.stoppedWith", { reason: friendlyFatal(s.fatal) });
  else if (done && lastRunWasTest && !s.stopped) msg = t("testDone.text", { n: fmt.format((s.deleted || 0) + (s.gone || 0)) });
  else if (done) msg = s.stopped ? t("run.stopped") : t("run.done");
  else if (s.waiting || s.waitUntil) msg = t("run.limited", { s: secsUntil(s.waitUntil) });
  else if (s.batchUntil) msg = t("run.batch", { s: secsUntil(s.batchUntil) });
  else if (s.paused) msg = t("run.paused");
  else msg = hasTotal ? `${t("run.working")} ${t("run.progress", { done: fmt.format(acted), total: fmt.format(s.total) })}` : t("run.working");
  // The history is the only copy of what was deleted; say so if any of it couldn't be saved.
  if (s.historyErrors) msg += " " + t("run.historyErrors", { n: fmt.format(s.historyErrors) });
  $("p-status").textContent = msg;
  refreshHistoryCount();

  const bar = $("p-bar");
  bar.classList.toggle("done", !!done && !s.fatal && !s.stopped);
  bar.classList.toggle("indeterminate", !done && !hasTotal);
  bar.firstElementChild.style.width = hasTotal ? `${Math.min(100, (acted / s.total) * 100)}%` : "";
}

const secsUntil = (ts) => (ts ? Math.max(0, Math.round((ts - Date.now()) / 1000)) : "…");

function friendlyFatal(f) {
  if (/404|endpoint/.test(f)) return t("run.fatalApi");
  if (/session|auth|403|401/.test(f)) return t("run.fatalSession");
  return f;
}

init();
