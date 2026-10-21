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

// "Test with 5 first" is a switch above the main button: a test deletes 5 and stops, then offers
// the rest. It is on only for someone who has never run the extension; once any run has started
// (a test or not, remembered in storage) it starts off, through reloads and reinstalls of the
// page, and stays one click away.
const RAN_KEY = "xcleaner.ran";
const TESTED_KEY = "xcleaner.tested"; // set by earlier versions after a passed test
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
  renderResume();
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
    const got = await chrome.storage.local.get([RAN_KEY, TESTED_KEY, PREFS_KEY]);
    $("testFirst").checked = !got[RAN_KEY] && !got[TESTED_KEY];
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
  } else await loadSavedRun();
}

// --- Picking up a run ------------------------------------------------------------
// The x.com tab keeps a record of each run (run-state.js). When it says a run was cut off by a
// reload, stopped, failed, or filled its batch, the setup offers to continue it with the same
// settings, skipping what is already done.
let savedRun = null; // the record, when there is something to offer
let runningElsewhere = false; // this account's run is going in another x.com tab
let savedOffer = null; // { kind, n }

async function loadSavedRun() {
  savedRun = savedOffer = null;
  if (account) {
    const key = XRun.key(account);
    const record = (await chrome.storage.local.get(key).catch(() => ({})))[key];
    // A record still "running" from another x.com tab may just be running there: ask that tab.
    let activeElsewhere = false;
    const where = record?.settings?.tabId;
    if (record?.status === "running" && where && where !== tabId) {
      const st = await chrome.tabs.sendMessage(where, { type: "status" }).catch(() => null);
      activeElsewhere = !!st?.running;
      // Two runs on one account would undo each other's progress and history: one at a time.
      if (activeElsewhere) {
        runningElsewhere = true;
        setAccount("out", "run.elsewhere");
      }
    }
    savedOffer = XRun.offer(record, { activeElsewhere });
    if (savedOffer) savedRun = record;
  }
  // In the tab opened to pick the file again, open on the archive picker.
  if (inTab && savedRun?.settings.source === "archive" && sourceValue() !== "archive") {
    document.querySelector('input[name="source"][value="archive"]').checked = true;
    refreshStart();
  }
  renderResume();
}

const needsFile = () => savedRun?.settings.source === "archive" && !(archiveItems && archiveItems.length);

function renderResume() {
  $("resumeBox").classList.toggle("hidden", !savedOffer);
  if (!savedOffer) return;
  const n = new Intl.NumberFormat(XI18n.locale).format(savedOffer.n);
  $("resumeText").replaceChildren(t("resume." + savedOffer.kind, { n }));
  // An archive run needs its file again: the picker is in a tab, where the file dialog works.
  if (needsFile()) {
    const hint = document.createElement("small");
    hint.textContent = t(inTab ? "resume.needFileHere" : "resume.needFile");
    $("resumeText").append(hint);
  }
  $("resumeGo").textContent = needsFile() && !inTab ? t("resume.pickFile") : t(savedOffer.kind === "batch" ? "run.next" : "resume.continue");
  $("resumeGo").disabled = !signedIn || (needsFile() && inTab);
}

$("resumeGo").addEventListener("click", async () => {
  if (!savedRun) return;
  if (needsFile()) return $("pickInTab").click();
  const config = { ...XRun.continueConfig(savedRun), tabId };
  if (config.source === "archive") config.staged = true;
  lastRunWasTest = false;
  if (config.staged && !(await stageArchive(archiveItems))) return setAccount("out", "run.couldNotStart");
  const res = await send("start", { config });
  if (!res || !res.ok) return setAccount("out", res && res.error === "already-running" ? "run.alreadyRunning" : "run.couldNotStart");
  savedRun = savedOffer = null;
  renderResume();
  enterRunning();
});

$("resumeDismiss").addEventListener("click", async () => {
  if (savedRun && account) {
    const record = { ...savedRun, status: "dismissed", updatedAt: Date.now() };
    await chrome.storage.local.set({ [XRun.key(account)]: record }).catch(() => {});
  }
  savedRun = savedOffer = null;
  renderResume();
});

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
  renderResume(); // an archive run waiting for its file can continue now
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
  const ready = signedIn && !runningElsewhere && anyType && (!archive || (archiveItems && archiveItems.length));
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

const parseKeep = () => XRun.parseKeepIds($("f-keep").value);

$("start").addEventListener("click", async () => {
  const types = selectedTypes();
  if (types.like && sourceValue() === "timeline") types.like = false; // likes need the archive
  const config = {
    source: sourceValue(),
    staged: sourceValue() === "archive",
    types,
    keyword: $("f-keyword").value.trim() || null,
    ...XRun.dateBounds($("f-since").value, $("f-until").value),
    keepIds: parseKeep(),
    speed: speedValue(),
    limit: isTest() ? 5 : batchValue(),
    test: isTest(),
    order: orderValue(),
    tabId, // so the saved record knows which tab runs it
    // After a test, the full run skips what the test already removed.
    resume: $("resumePrev").checked || testPassed,
  };
  lastRunWasTest = isTest();
  chrome.storage.local.set({ [RAN_KEY]: true }).catch(() => {});
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
// The items just deleted (newest first, from the snapshot). Rows already shown stay put; new ones
// are added on top and animate in; ones that dropped off the list animate out, then go.
function renderRecent(list) {
  const box = $("recent");
  $("recentBox").classList.remove("hidden"); // there from the start of the run, at its full height
  box.dataset.empty = t("run.recentEmpty");
  const key = (r) => r.kind + ":" + r.id;
  const keys = new Set(list.map(key));
  for (const el of [...box.children]) {
    if (keys.has(el.dataset.key) || el.classList.contains("leaving")) continue;
    el.classList.add("leaving");
    // Removed when its animation ends, or right away when motion is reduced (no animation runs).
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 450);
  }
  for (const r of [...list].reverse()) {
    if (box.querySelector(`[data-key="${CSS.escape(key(r))}"]`)) continue;
    box.prepend(recentPost(r, key(r)));
  }
}

// One deleted item drawn like a post on x.com: avatar, name, @handle · date, then "Replying to" or
// "You reposted" when it applies, and the text. Built from text nodes only.
function recentPost(r, k) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  // Whose post it is: yours, the reposted author (from "RT @name:"), or unknown for a like.
  const mine = (profilePath || "").replace(/^\//, "");
  const rt = r.kind === "repost" ? (r.text || "").match(/^RT @(\w+): ?/) : null;
  const handle = r.kind === "like" ? "" : rt ? rt[1] : mine;
  const text = rt ? r.text.slice(rt[0].length) : r.text;
  const li = el("li");
  li.dataset.key = k;
  li.append(el("span", "av", (handle[0] || "?").toUpperCase()));
  const body = el("div", "body");
  const head = el("div", "head");
  head.append(el("b", null, handle || (r.kind === "like" ? t("history.unknownAuthor") : t("run.you"))));
  if (handle) head.append(el("span", null, "@" + handle));
  const when = r.createdAt && new Date(r.createdAt);
  if (when && !Number.isNaN(when.getTime())) {
    head.append(el("span", null, "·"), el("span", "when", new Intl.DateTimeFormat(XI18n.locale, { dateStyle: "medium" }).format(when)));
  }
  if (r.kind === "repost" || r.kind === "like") body.append(el("div", "ctx", t("kind." + r.kind)));
  if (r.kind === "repost" || r.kind === "like" || (r.kind === "reply" && r.replyTo)) li.classList.add("has-ctx");
  body.append(head);
  if (r.kind === "reply" && r.replyTo) {
    // "Replying to @name", the @name in X's blue.
    const [before, after = ""] = t("run.replyTo").split("{user}");
    const ctx = el("div", "ctx", before);
    ctx.append(el("span", "at", "@" + r.replyTo), after);
    body.append(ctx);
  }
  body.append(el("p", "txt", text || r.id));
  li.append(body);
  return li;
}

function backToSetup() {
  lastRender = null;
  $("recent").replaceChildren();
  $("recentBox").classList.add("hidden");
  send("dismiss");
  $("progress").classList.add("hidden");
  $("setup").classList.remove("hidden");
  for (const id of ["pause", "stop"]) $(id).classList.remove("hidden");
  for (const id of ["again", "viewProfile", "continueFull", "nextBatch"]) $(id).classList.add("hidden");
  renderText();
  refreshStart();
  loadSavedRun(); // a stopped run is still offered to continue
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
  $("recent").replaceChildren(); // a new run starts its own list
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

  // Progress counts this run only, so a resumed run starts from zero against what is left.
  const acted = (s.deleted || 0) + (s.gone || 0) + (s.failures || 0);
  const hasTotal = s.total > 0;
  // While reading the profile, progress is against its post count (X lists at most ~3,200).
  const scanOf = s.scanTotal ? Math.min(s.scanTotal, PROFILE_LIMIT) : 0;
  const scanKnown = s.scanning && scanOf > 0 && (s.found || 0) <= scanOf;
  const read = fmt.format(s.found || 0);

  // The batch: how far this one is ("120 of 500"), its size and its order. Items already gone count
  // toward the batch, as in the engine.
  const inBatch = (s.deleted || 0) + (s.gone || 0);
  const order = t(s.order === "oldest" ? "run.orderOldest" : "run.orderNewest");
  const isTestRun = s.test || lastRunWasTest;
  if (s.limit) {
    $("p-batch").textContent = t("run.progress", { done: fmt.format(Math.min(inBatch, s.limit)), total: fmt.format(s.limit) });
    $("p-batchLabel").textContent = isTestRun ? t("run.testLabel") : t("run.batchLabel", { n: fmt.format(s.limit), order });
  } else {
    $("p-batch").textContent = hasTotal ? t("run.progress", { done: fmt.format(acted), total: fmt.format(s.total) }) : t("run.all");
    $("p-batchLabel").textContent = t("run.allLabel", { order });
  }

  let msg;
  if (s.fatal) msg = t("run.stoppedWith", { reason: friendlyFatal(s.fatal) });
  else if (done && lastRunWasTest && !s.stopped) msg = t("testDone.text", { n: fmt.format((s.deleted || 0) + (s.gone || 0)) });
  else if (done && batchFull(s)) {
    msg = t("run.batchDone", { n: fmt.format((s.deleted || 0) + (s.gone || 0)) });
    if (hasTotal && s.total > acted) msg += " " + t("run.left", { n: fmt.format(s.total - acted) });
  } else if (done && s.stopped && s.scanning) msg = t("run.stoppedScan", { n: read });
  else if (nothingListed(s, done)) msg = t("run.nothingListed");
  else if (done) msg = s.stopped ? t("run.stopped") : t("run.done");
  // A wait for X comes first: it explains why nothing moves, and for how long.
  else if (s.waitUntil || s.waiting)
    msg = s.scanning ? t("run.scanLimited", { time: waitText(s.waitUntil), n: read }) : t("run.limited", { time: waitText(s.waitUntil) });
  else if (s.stalled) msg = t(s.stalled === "limited" ? "run.stalledLimited" : "run.stalled");
  else if (s.retryUntil) msg = t("run.retrying", { time: waitText(s.retryUntil) });
  else if (s.batchUntil) msg = t("run.batch", { time: waitText(s.batchUntil) });
  else if (s.paused) msg = t("run.paused");
  else if (s.scanning) msg = scanKnown ? t("run.scanningOf", { n: read, total: fmt.format(scanOf) }) : t("run.scanning", { n: read });
  else msg = hasTotal ? `${t("run.working")} ${t("run.progress", { done: fmt.format(acted), total: fmt.format(s.total) })}` : t("run.working");
  // Failures aren't a counter any more, but they are never hidden.
  if (s.failures) msg += " · " + t("run.failuresNote", { n: fmt.format(s.failures) });
  // The history is the only copy of what was deleted; say so if any of it couldn't be saved.
  if (s.historyErrors) msg += " " + t("run.historyErrors", { n: fmt.format(s.historyErrors) });
  $("p-status").textContent = msg;
  renderRecent(s.recent || []);
  refreshHistoryCount();
  // Pause and Resume follow the run, which can also pause itself when X keeps failing.
  if (!done) {
    $("pause").classList.toggle("hidden", !!s.paused);
    $("resume").classList.toggle("hidden", !s.paused);
  }

  const bar = $("p-bar");
  // The bar follows the profile read while reading, then the batch (or the total when deleting
  // everything at once and the total is known).
  bar.classList.toggle("done", !!done && !s.fatal && !s.stopped && !nothingListed(s, done));
  bar.classList.toggle("indeterminate", !done && !s.limit && !hasTotal && !scanKnown);
  bar.firstElementChild.style.width = scanKnown
    ? `${Math.min(98, ((s.found || 0) / scanOf) * 100)}%`
    : s.limit
      ? `${Math.min(100, (inBatch / s.limit) * 100)}%`
      : hasTotal
        ? `${Math.min(100, (acted / s.total) * 100)}%`
        : "";
}

const PROFILE_LIMIT = 3200; // about how far back X lists a profile

// A timeline run that ended without the profile listing a single item of the chosen kinds: say
// so, and point at the archive, instead of a "Done." that reads as if something happened.
const nothingListed = (s, done) => !!done && !s.fatal && !s.stopped && s.seen === 0 && (s.deleted || 0) + (s.gone || 0) + (s.failures || 0) === 0;

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
