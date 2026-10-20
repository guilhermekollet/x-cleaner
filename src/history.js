// The history of what the extension deleted, kept as a backup in the browser's local extension
// storage, one list per account. Every post, reply, repost or like a run deletes is recorded with
// as much as the archive or the timeline gave us: the full text, media, links, what it replied to
// or reposted, and when it was posted and deleted. Nothing here leaves the browser; the history
// page turns it into a JSON or CSV file the user downloads.
//
// Storage layout, per account (`me` is the numeric user id):
//   xcleaner.history.<me>      { v, count, chunks, handle, updatedAt }
//   xcleaner.history.<me>.<i>  up to CHUNK records, oldest deletion first
// Records are appended after every deletion, so a run that is interrupted loses nothing. Chunks
// keep each write small: an append rewrites only the last chunk, not the whole history.
globalThis.XHistory = (() => {
  const PREFIX = "xcleaner.history.";
  const CHUNK = 250;
  const KINDS = ["post", "reply", "repost", "like"];

  const statusUrl = (id) => `https://x.com/i/status/${id}`;

  // X escapes these three in full_text; the website shows them as plain characters.
  function unescapeText(s) {
    return String(s || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function isoDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  // A video or GIF comes in several encodings; keep the best mp4.
  function mediaUrl(m) {
    const variants = (m.video_info?.variants || []).filter((v) => v.content_type === "video/mp4" && v.url);
    if (variants.length) return variants.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0].url;
    return m.media_url_https || m.media_url || m.expanded_url || null;
  }

  // The parts of a tweet worth keeping, from either the archive's tweets.js rows or the
  // GraphQL `legacy` object — both use the same field names.
  function details(t) {
    const media = (t.extended_entities?.media || t.entities?.media || [])
      .map((m) => ({ type: m.type || "photo", url: mediaUrl(m) }))
      .filter((m) => m.url);
    const links = (t.entities?.urls || []).map((u) => u.expanded_url || u.url).filter(Boolean);
    const replyTo = t.in_reply_to_status_id_str
      ? { id: t.in_reply_to_status_id_str, user: t.in_reply_to_screen_name || null }
      : null;
    return { text: unescapeText(t.full_text || t.text), media, links, replyTo };
  }

  // Builds the record for one deleted item. `item` is what the engine worked on (from the
  // archive or the timeline); missing parts are left empty rather than guessed.
  function fromItem(item, { deletedAt = new Date(), source = null } = {}) {
    const kind = KINDS.includes(item.kind) ? item.kind : "post";
    const linkTo = item.kind === "like" && /^https:\/\/(x|twitter)\.com\//.test(item.url || "") ? item.url : null;
    return normalize({
      id: item.id,
      kind,
      url: linkTo || statusUrl(item.id),
      createdAt: item.createdAt,
      deletedAt,
      text: item.text,
      media: item.media,
      links: item.links,
      replyTo: item.replyTo,
      repostOf: item.repostOf,
      source,
    });
  }

  // Brings a stored or imported record to the current shape, so the page and the exports never
  // have to cope with missing fields. Returns null for anything without an id.
  function normalize(r) {
    if (!r || typeof r !== "object") return null;
    const id = r.id == null ? "" : String(r.id).trim();
    if (!/^\d+$/.test(id)) return null;
    const ref = (x) => (x && x.id ? { id: String(x.id), user: x.user || null, ...(x.text ? { text: String(x.text) } : {}) } : null);
    return {
      id,
      kind: KINDS.includes(r.kind) ? r.kind : "post",
      url: typeof r.url === "string" && r.url ? r.url : statusUrl(id),
      createdAt: isoDate(r.createdAt),
      deletedAt: isoDate(r.deletedAt),
      text: typeof r.text === "string" ? r.text : "",
      media: Array.isArray(r.media)
        ? r.media.filter((m) => m && m.url).map((m) => ({ type: m.type || "photo", url: String(m.url) }))
        : [],
      links: Array.isArray(r.links) ? r.links.filter(Boolean).map(String) : [],
      replyTo: ref(r.replyTo),
      repostOf: ref(r.repostOf),
      source: r.source === "archive" || r.source === "timeline" ? r.source : null,
    };
  }

  // Newest deletion first; within the same moment, the newer post (larger id) first. One entry
  // per item: a post that was recorded twice keeps its latest deletion.
  function arrange(records) {
    const byKey = new Map();
    for (const raw of records) {
      const r = normalize(raw);
      if (!r) continue;
      const key = r.kind + ":" + r.id;
      const prev = byKey.get(key);
      if (!prev || (r.deletedAt || "") >= (prev.deletedAt || "")) byKey.set(key, r);
    }
    return [...byKey.values()].sort((a, b) => {
      const d = (b.deletedAt || "").localeCompare(a.deletedAt || "");
      if (d) return d;
      return BigInt(b.id) > BigInt(a.id) ? 1 : BigInt(b.id) < BigInt(a.id) ? -1 : 0;
    });
  }

  // Simple search: every word must appear in the text, the id, a link, or the user replied to or
  // reposted. `kind` narrows to one type ("all" or empty for every type).
  function search(records, query, kind) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    return records.filter((r) => {
      if (kind && kind !== "all" && r.kind !== kind) return false;
      if (!words.length) return true;
      const hay = [r.text, r.id, r.url, ...r.links, r.replyTo?.user, r.repostOf?.user, r.repostOf?.text]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  function countByKind(records) {
    const by = { post: 0, reply: 0, repost: 0, like: 0 };
    for (const r of records) by[r.kind] = (by[r.kind] || 0) + 1;
    return by;
  }

  // --- Exports ---------------------------------------------------------------------------
  function toJSON(records, { account = null, exportedAt = new Date(), version = null } = {}) {
    return JSON.stringify(
      {
        app: "X Cleaner",
        version,
        kind: "deletion-history",
        exportedAt: isoDate(exportedAt),
        account,
        count: records.length,
        items: records,
      },
      null,
      2
    );
  }

  const CSV_COLUMNS = ["deleted_at", "created_at", "type", "id", "url", "text", "media", "links", "reply_to", "repost_of"];

  // Spreadsheets run a cell that starts with =, +, - or @ as a formula. Replies start with
  // "@handle", so those cells get a leading apostrophe; the JSON keeps the exact text.
  function csvCell(value) {
    let s = value == null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function toCSV(records) {
    const rows = [CSV_COLUMNS];
    for (const r of records) {
      rows.push([
        r.deletedAt,
        r.createdAt,
        r.kind,
        r.id,
        r.url,
        r.text,
        r.media.map((m) => m.url).join(" "),
        r.links.join(" "),
        r.replyTo ? statusUrl(r.replyTo.id) : "",
        r.repostOf ? statusUrl(r.repostOf.id) : "",
      ]);
    }
    // CRLF line ends, as RFC 4180 and spreadsheets expect.
    return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  // --- Storage ---------------------------------------------------------------------------
  // `store` is chrome.storage.local, or anything with the same get/set/remove (the tests pass a
  // plain in-memory one).
  const metaKey = (me) => PREFIX + me;
  const chunkKey = (me, i) => PREFIX + me + "." + i;
  const local = () => globalThis.chrome?.storage?.local;

  async function readMeta(me, store = local()) {
    const got = await store.get(metaKey(me));
    return got[metaKey(me)] || null;
  }

  // Adds records to an account's history. `info.handle` (the @name, when known) is kept so the
  // page can show which account a history belongs to.
  async function append(me, records, info = {}, store = local()) {
    const recs = records.map(normalize).filter(Boolean);
    if (!recs.length) return readMeta(me, store);
    const meta = (await readMeta(me, store)) || { v: 1, count: 0, chunks: 0, handle: null, updatedAt: null };
    const writes = {};
    let i = Math.max(0, meta.chunks - 1);
    let chunk = meta.chunks ? (await store.get(chunkKey(me, i)))[chunkKey(me, i)] || [] : [];
    for (const r of recs) {
      if (chunk.length >= CHUNK) {
        writes[chunkKey(me, i)] = chunk;
        i++;
        chunk = [];
      }
      chunk.push(r);
    }
    writes[chunkKey(me, i)] = chunk;
    const next = {
      v: 1,
      count: meta.count + recs.length,
      chunks: i + 1,
      handle: info.handle || meta.handle || null,
      updatedAt: new Date().toISOString(),
    };
    writes[metaKey(me)] = next;
    await store.set(writes); // the chunks and the meta land together
    return next;
  }

  // Every record for one account, newest deletion first.
  async function load(me, store = local()) {
    const meta = await readMeta(me, store);
    if (!meta || !meta.chunks) return [];
    const keys = Array.from({ length: meta.chunks }, (_, i) => chunkKey(me, i));
    const got = await store.get(keys);
    return arrange(keys.flatMap((k) => got[k] || []));
  }

  async function clear(me, store = local()) {
    const meta = await readMeta(me, store);
    const keys = [metaKey(me)];
    for (let i = 0; i < (meta?.chunks || 0); i++) keys.push(chunkKey(me, i));
    await store.remove(keys);
  }

  // The accounts that have a history, most recently updated first.
  async function accounts(store = local()) {
    const keys = store.getKeys ? await store.getKeys() : Object.keys(await store.get(null));
    const metas = keys.filter((k) => /^xcleaner\.history\.\d+$/.test(k));
    if (!metas.length) return [];
    const got = await store.get(metas);
    return metas
      .map((k) => ({ id: k.slice(PREFIX.length), ...got[k] }))
      .filter((a) => a.count > 0)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  // True when a storage change touches this account's history (for live updates on the page).
  const touches = (me, key) => key === metaKey(me) || key.startsWith(metaKey(me) + ".");

  return {
    CHUNK,
    statusUrl,
    details,
    fromItem,
    normalize,
    arrange,
    search,
    countByKind,
    toJSON,
    toCSV,
    readMeta,
    append,
    load,
    clear,
    accounts,
    touches,
  };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XHistory;
