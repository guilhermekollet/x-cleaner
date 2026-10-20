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

function renderRecord(r) {
  const head = h(
    "div",
    { class: "record-head" },
    h("span", { class: "kind" }, t("history.kind." + r.kind)),
    // A like has no date of its own in the archive; anything else without one says so.
    r.createdAt
      ? h("span", { class: "when" }, t("history.posted", { date: fmtDate(r.createdAt) }))
      : r.kind !== "like" && h("span", { class: "when" }, t("history.noDate")),
    extLink(r.url, h("span", { class: "id" }, r.id))
  );

  const context = [];
  if (r.replyTo) context.push(extLink(XHistory.statusUrl(r.replyTo.id), t("history.replyTo", { user: r.replyTo.user ? "@" + r.replyTo.user : r.replyTo.id })));
  if (r.repostOf) context.push(extLink(XHistory.statusUrl(r.repostOf.id), t("history.repostOf", { user: r.repostOf.user ? "@" + r.repostOf.user : r.repostOf.id })));

  const attachments = [
    ...r.media.map((m, i) => {
      // Numbered within its type when there are several: Photo 1, Photo 2, Video.
      const k = mediaKind(m.type);
      const same = r.media.filter((x) => mediaKind(x.type) === k);
      const n = same.length > 1 ? " " + (r.media.slice(0, i + 1).filter((x) => mediaKind(x.type) === k).length) : "";
      return extLink(m.url, icon(k), t("history.media." + k) + n);
    }),
    ...r.links.map((u) => extLink(u, icon("link"), hostOf(u))),
  ];

  return h(
    "li",
    { class: "record" },
    head,
    context.length ? h("div", { class: "record-context" }, context) : null,
    r.text ? h("p", { class: "record-text" }, r.text) : null,
    attachments.length ? h("div", { class: "record-attachments" }, attachments) : null,
    r.deletedAt ? h("p", { class: "record-deleted" }, t("history.deleted", { date: fmtDate(r.deletedAt) })) : null
  );
}

const ICONS = {
  photo: ["M4.5 5.5h15v13h-15z", "m4.5 15.5 4-4 3 3 2.5-2.5 5.5 5.5"],
  video: ["M4.5 5.5h15v13h-15z", "m10.5 9.5 4 2.5-4 2.5z"],
  gif: ["M4.5 5.5h15v13h-15z", "M9.5 10.5h-2v3h2v-1.5M12 10.5v3M14.5 13.5v-3h2M14.5 12h1.5"],
  link: ["M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.8", "M14 10a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.3-1.3"],
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
// A run in an x.com tab keeps adding to the history; follow along without losing the search.
let changeTimer = null;
globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = Object.keys(changes);
  const ours = keys.some((k) => current && XHistory.touches(current, k));
  const newAccount = keys.some((k) => /^xcleaner\.history\.\d+$/.test(k) && !accountList.some((a) => "xcleaner.history." + a.id === k));
  if (!ours && !newAccount) return;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => reload({ keepPage: true }), 400);
});

// --- Start -----------------------------------------------------------------------------
XI18n.bindSwitch();
XI18n.onChange(() => render());
XI18n.apply();
render();
XI18n.load().then(() => reload());
