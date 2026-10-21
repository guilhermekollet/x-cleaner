// The history page: lists what X Cleaner deleted for one account, newest first, with a simple
// search and a filter by type, and makes the JSON and CSV backups. It opens in a tab of its own
// (from the popup's History button), reads only the browser's local extension storage, and makes
// the backup files on the computer: nothing is sent anywhere.
const $ = (id) => document.getElementById(id);
const { t } = XI18n;

const PAGE = 100; // records rendered at a time; "Show more" adds the next page
const KINDS = ["post", "reply", "repost", "like"];

let accountList = []; // [{ id, handle, count, updatedAt }]
let current = new URLSearchParams(location.search).get("account"); // the account shown
let records = []; // every record of the current account, newest first
let shown = PAGE;
let kind = "all";
let loadState = "loading"; // "loading" | "ready" | "error"

// --- Small DOM helper: builds elements with text only, never parsed HTML ---------------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}
// Links in the history come from X; only web links are made clickable.
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);
const extLink = (href, ...children) =>
  safeUrl(href) ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, ...children) : h("span", {}, ...children);

const fmtNumber = (n) => new Intl.NumberFormat(XI18n.locale).format(n);
const fmtDate = (iso) =>
  new Intl.DateTimeFormat(XI18n.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, { n: fmtNumber(n) }));
const accountLabel = (a) => (a?.handle ? "@" + a.handle : a ? "ID " + a.id : "");

// --- Loading ---------------------------------------------------------------------------
async function loadAccounts() {
  accountList = await XHistory.accounts();
  if (current && !accountList.some((a) => a.id === current)) accountList.push({ id: current, count: 0 });
  if (!current && accountList.length) current = accountList[0].id;
}

async function loadRecords() {
  if (!current) {
    records = [];
    return;
  }
  records = await XHistory.load(current);
  const meta = accountList.find((a) => a.id === current);
  if (meta) meta.count = records.length;
}

async function reload({ keepPage = false } = {}) {
  try {
    await loadAccounts();
    await loadRecords();
    loadState = "ready";
  } catch {
    loadState = "error";
  }
  if (!keepPage) shown = PAGE;
  render();
}

// --- Rendering -------------------------------------------------------------------------
function render() {
  document.title = `${t("history.title")} · X Cleaner`;
  renderAccounts();
  const acct = accountList.find((a) => a.id === current);
  const total = records.length;
  $("total").textContent = plural(total, "history.totalOne", "history.total");
  $("accountName").textContent = accountLabel(acct);
  for (const id of ["downloadJson", "downloadCsv", "clear"]) $(id).disabled = !total;

  const empty = loadState !== "ready" || !total;
  $("browse").classList.toggle("hidden", empty);
  $("empty").classList.toggle("hidden", !empty);
  $("empty").classList.toggle("error", loadState === "error");
  if (empty) {
    $("emptyTitle").textContent =
      loadState === "loading" ? t("history.loading") : loadState === "error" ? t("history.loadError") : t("history.emptyTitle");
    $("emptyText").textContent = loadState === "ready" ? t("history.empty") : "";
    return;
  }
  renderKinds();
  renderList();
}

function renderAccounts() {
  const box = $("accounts");
  box.setAttribute("aria-label", t("history.account"));
  box.classList.toggle("hidden", accountList.length < 2);
  box.replaceChildren(
    ...accountList.map((a) => {
      const b = h("button", { type: "button", role: "tab", "aria-selected": String(a.id === current) }, accountLabel(a));
      b.addEventListener("click", () => {
        if (a.id === current) return;
        current = a.id;
        history.replaceState(null, "", `?account=${a.id}`);
        $("query").value = "";
        kind = "all";
        records = [];
        loadState = "loading";
        reload();
      });
      return b;
    })
  );
}

// The type filter: one chip per type that has records, each with its count.
function renderKinds() {
  const by = XHistory.countByKind(records);
  const options = [["all", t("history.all"), records.length], ...KINDS.filter((k) => by[k]).map((k) => [k, t("types." + k), by[k]])];
  if (!options.some(([k]) => k === kind)) kind = "all";
  $("kinds").replaceChildren(
    ...options.map(([k, label, n]) => {
      const input = h("input", { type: "radio", name: "kind", value: k });
      input.checked = k === kind;
      input.addEventListener("change", () => {
        kind = k;
        shown = PAGE;
        renderList();
      });
      return h("label", { class: "chip" }, input, h("span", {}, label, h("small", {}, fmtNumber(n))));
    })
  );
}

function renderList() {
  const matches = XHistory.search(records, $("query").value, kind);
  const page = matches.slice(0, shown);
  $("list").replaceChildren(...page.map(renderRecord));
  $("showing").textContent = matches.length
    ? t("history.showing", { shown: fmtNumber(page.length), total: fmtNumber(matches.length) })
    : t("history.none");
  const rest = matches.length - page.length;
  $("more").classList.toggle("hidden", rest <= 0);
  $("more").textContent = t("history.more", { n: fmtNumber(Math.min(PAGE, rest)) });
}

// Each record is drawn the way x.com draws a post: avatar, name, @handle · date, "Replying to",
// the text with its mentions, hashtags and links, the media grid and link card, and a quiet
// footer for when it was deleted. Nothing is fetched: the avatar is the handle's initial and the
// media are placeholders that link to the files.
function renderRecord(r) {
  const meHandle = accountList.find((a) => a.id === current)?.handle || null;
  let author = meHandle;
  let text = r.text;
  let social = null; // the grey line above a post: "You reposted", "You liked"
  if (r.kind === "repost") {
    author = r.repostOf?.user || r.text.match(/^RT @(\w+):/)?.[1] || null;
    text = r.repostOf?.text || r.text.replace(/^RT @\w+: /, "");
    social = h("div", { class: "post-social" }, icon("repost"), t("history.youReposted"));
  } else if (r.kind === "like") {
    author = r.url.match(/^https:\/\/(?:x|twitter)\.com\/(?!i\/)(\w+)\/status\//)?.[1] || null;
    social = h("div", { class: "post-social" }, icon("heart"), t("history.youLiked"));
  }

  const head = h(
    "div",
    { class: "post-head" },
    h("b", { class: "post-name" }, author || t("history.unknownAuthor")),
    author && h("span", { class: "post-handle" }, "@" + author),
    r.createdAt && h("span", { class: "post-dot", "aria-hidden": "true" }, "·"),
    r.createdAt && h("time", { datetime: r.createdAt, title: fmtDate(r.createdAt) }, fmtDay(r.createdAt)),
    extLink(r.url, icon("open")),
  );
  head.lastElementChild.classList.add("post-open");
  head.lastElementChild.setAttribute("title", t("history.openOnX"));
  head.lastElementChild.setAttribute("aria-label", t("history.openOnX"));

  const replying =
    r.replyTo &&
    h(
      "div",
      { class: "post-replying" },
      ...fill(t("history.replyingTo"), extLink(XHistory.statusUrl(r.replyTo.id), r.replyTo.user ? "@" + r.replyTo.user : r.replyTo.id))
    );

  return h(
    "li",
    { class: "post" },
    social,
    h(
      "div",
      { class: "post-row" },
      h("div", { class: "avatar", "aria-hidden": "true" }, author ? author[0].toUpperCase() : icon("person")),
      h(
        "div",
        { class: "post-body" },
        head,
        replying,
        text && h("p", { class: "post-text" }, linkify(text)),
        mediaGrid(r.media),
        ...r.links.map(linkCard),
        h(
          "div",
          { class: "post-foot" },
          h("span", {}, icon("trash"), r.deletedAt ? t("history.deleted", { date: fmtDate(r.deletedAt) }) : ""),
          h("span", { class: "id" }, r.id)
        )
      )
    )
  );
}

// Puts a node where "{user}" is in a translated sentence.
function fill(template, node) {
  const [before, after = ""] = template.split("{user}");
  return [before, node, after];
}

const fmtDay = (iso) => new Intl.DateTimeFormat(XI18n.locale, { dateStyle: "medium" }).format(new Date(iso));

// Mentions, hashtags and web links become links, as on x.com; everything else stays text.
function linkify(text) {
  const out = [];
  const re = /(https?:\/\/[^\s]+)|(?<![\w@])@(\w{1,15})|(?<![\w#])#([\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const href = m[1] ? m[1] : m[2] ? `https://x.com/${m[2]}` : `https://x.com/hashtag/${encodeURIComponent(m[3])}`;
    out.push(extLink(href, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The media grid x.com uses (one wide, two side by side, three with one tall, four in a square),
// with placeholders instead of the images: loading them would be a request to X's servers.
function mediaGrid(media) {
  if (!media.length) return null;
  const counts = {};
  return h(
    "div",
    { class: "media-grid", "data-count": String(Math.min(media.length, 4)) },
    media.slice(0, 4).map((m) => {
      const k = mediaKind(m.type);
      counts[k] = (counts[k] || 0) + 1;
      // Numbered within its type when there are several: Photo 1, Photo 2, Video.
      const several = media.filter((x) => mediaKind(x.type) === k).length > 1;
      return extLink(m.url, icon(k), h("span", {}, t("history.media." + k) + (several ? " " + counts[k] : "")));
    })
  );
}

const linkCard = (u) => extLink(u, h("span", { class: "card-host" }, hostOf(u)), h("span", { class: "card-url" }, u));

const ICONS = {
  photo: ["M4.5 5.5h15v13h-15z", "m4.5 15.5 4-4 3 3 2.5-2.5 5.5 5.5"],
  video: ["M4.5 5.5h15v13h-15z", "m10.5 9.5 4 2.5-4 2.5z"],
  gif: ["M4.5 5.5h15v13h-15z", "M9.5 10.5h-2v3h2v-1.5M12 10.5v3M14.5 13.5v-3h2M14.5 12h1.5"],
  repost: ["M4.5 11V8a2 2 0 0 1 2-2h11.5l-3-3", "M19.5 13v3a2 2 0 0 1-2 2H6l3 3"],
  heart: ["M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10C19.5 15.4 12 20 12 20z"],
  trash: ["M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"],
  open: ["M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  person: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20a7.5 7.5 0 0 1 15 0"],
};
function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONS[name]) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

const mediaKind = (type) => (type === "video" ? "video" : type === "animated_gif" ? "gif" : "photo");
function hostOf(u) {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
}

// --- Search and paging ---------------------------------------------------------------------
let searchTimer = null;
$("query").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    shown = PAGE;
    renderList();
  }, 120);
});
$("more").addEventListener("click", () => {
  shown += PAGE;
  renderList();
});

// --- Backups -------------------------------------------------------------------------
// The files are made here, from what is in this browser, and saved through a temporary blob
// link: nothing is uploaded.
function save(text, type, ext) {
  const acct = accountList.find((a) => a.id === current);
  const day = new Date().toISOString().slice(0, 10);
  const name = `x-cleaner-history-${acct?.handle || current}-${day}.${ext}`;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadJson() {
  const acct = accountList.find((a) => a.id === current);
  const version = globalThis.chrome?.runtime?.getManifest?.().version || null;
  save(XHistory.toJSON(records, { account: { id: current, handle: acct?.handle || null }, version }), "application/json", "json");
}
$("downloadJson").addEventListener("click", downloadJson);
$("confirmJson").addEventListener("click", downloadJson);
// The byte-order mark lets spreadsheet apps read the accents as UTF-8.
$("downloadCsv").addEventListener("click", () => save("﻿" + XHistory.toCSV(records), "text/csv;charset=utf-8", "csv"));

// --- Clearing --------------------------------------------------------------------------
$("clear").addEventListener("click", () => {
  $("confirmText").textContent = t("history.confirmText", { n: fmtNumber(records.length) });
  $("confirmClear").showModal();
});
$("confirmClear").addEventListener("close", async () => {
  if ($("confirmClear").returnValue !== "clear") return;
  $("confirmClear").returnValue = "";
  await XHistory.clear(current).catch(() => {});
  accountList = accountList.filter((a) => a.id !== current);
  current = accountList[0]?.id || current;
  history.replaceState(null, "", `?account=${current}`);
  await reload();
});

// --- Live updates ----------------------------------------------------------------------
// A run in an x.com tab keeps adding to the history; follow along without losing the search. A
// long run adds an item every second or two, and reloading means reading and sorting the whole
// history, so it refreshes at most every few seconds, and not while the tab is in the background.
const REFRESH_EVERY = 5000;
let changeTimer = null;
let stale = false;
let lastReload = 0;
function scheduleReload() {
  stale = true;
  if (document.hidden || changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    stale = false;
    lastReload = Date.now();
    reload({ keepPage: true });
  }, Math.max(400, REFRESH_EVERY - (Date.now() - lastReload)));
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && stale) scheduleReload();
});
globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.keys(changes);
  const ours = keys.some((k) => current && XHistory.touches(current, k));
  const newAccount = keys.some((k) => /^xcleaner\.history\.\d+$/.test(k) && !accountList.some((a) => "xcleaner.history." + a.id === k));
  if (ours || newAccount) scheduleReload();
});

// --- Start -----------------------------------------------------------------------------
XI18n.bindSwitch();
XI18n.onChange(() => render());
XI18n.apply();
render();
XI18n.load().then(() => reload());
