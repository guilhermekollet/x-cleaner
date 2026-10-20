// Tests for the deletion history: how a deleted item becomes a record, how stored records are
// normalized and ordered, the search, the JSON and CSV backups, and the chunked storage (against
// an in-memory stand-in for chrome.storage.local). Run with `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XHistory = require("../src/history.js");

const deletedAt = new Date("2026-10-20T12:00:00Z");

test("fromItem keeps everything the item carries and adds the post's link", () => {
  const r = XHistory.fromItem(
    {
      id: "1850000000000000001",
      kind: "reply",
      createdAt: "Mon Mar 04 12:00:00 +0000 2019",
      text: "@friend agreed",
      media: [{ type: "photo", url: "https://pbs.twimg.com/media/a.jpg" }],
      links: ["https://example.com"],
      replyTo: { id: "9", user: "friend" },
    },
    { deletedAt, source: "archive" }
  );
  assert.deepEqual(r, {
    id: "1850000000000000001",
    kind: "reply",
    url: "https://x.com/i/status/1850000000000000001",
    createdAt: "2019-03-04T12:00:00.000Z",
    deletedAt: "2026-10-20T12:00:00.000Z",
    text: "@friend agreed",
    media: [{ type: "photo", url: "https://pbs.twimg.com/media/a.jpg" }],
    links: ["https://example.com"],
    replyTo: { id: "9", user: "friend" },
    repostOf: null,
    source: "archive",
  });
});

test("fromItem links a like to the liked post, and only to x.com", () => {
  const like = XHistory.fromItem({ id: "5", kind: "like", url: "https://twitter.com/u/status/5" }, { deletedAt });
  assert.equal(like.url, "https://twitter.com/u/status/5");
  assert.equal(like.createdAt, null);
  const odd = XHistory.fromItem({ id: "6", kind: "like", url: "javascript:alert(1)" }, { deletedAt });
  assert.equal(odd.url, "https://x.com/i/status/6");
});

test("normalize fills missing fields and drops records without a numeric id", () => {
  assert.equal(XHistory.normalize({ kind: "post" }), null);
  assert.equal(XHistory.normalize({ id: "abc" }), null);
  assert.equal(XHistory.normalize(null), null);
  const r = XHistory.normalize({ id: 42, kind: "weird", createdAt: "not a date", media: [{}, { url: "u" }] });
  assert.equal(r.id, "42");
  assert.equal(r.kind, "post");
  assert.equal(r.createdAt, null);
  assert.equal(r.text, "");
  assert.deepEqual(r.media, [{ type: "photo", url: "u" }]);
  assert.deepEqual(r.links, []);
  assert.equal(r.url, "https://x.com/i/status/42");
});

test("details unescapes the text and picks the best video", () => {
  const d = XHistory.details({
    full_text: "a &lt;b&gt; &amp;amp; c",
    entities: { media: [{ type: "photo", media_url_https: "https://p" }] },
  });
  assert.equal(d.text, "a <b> &amp; c");
  assert.deepEqual(d.media, [{ type: "photo", url: "https://p" }]);
  assert.equal(d.replyTo, null);
});

test("arrange puts the newest deletion first and keeps one entry per item", () => {
  const out = XHistory.arrange([
    { id: "1", kind: "post", deletedAt: "2026-01-01T00:00:00Z", text: "old" },
    { id: "2", kind: "post", deletedAt: "2026-01-03T00:00:00Z" },
    { id: "1", kind: "post", deletedAt: "2026-01-05T00:00:00Z", text: "again" },
    { id: "1", kind: "like", deletedAt: "2026-01-02T00:00:00Z" },
    { id: "x" },
  ]);
  assert.deepEqual(out.map((r) => `${r.kind}:${r.id}`), ["post:1", "post:2", "like:1"]);
  assert.equal(out[0].text, "again");
});

test("search matches every word, case-insensitively, and filters by type", () => {
  const recs = XHistory.arrange([
    { id: "1", kind: "post", text: "Hello World", deletedAt: "2026-01-01T00:00:00Z" },
    { id: "2", kind: "reply", text: "hello there", replyTo: { id: "9", user: "Friend" }, deletedAt: "2026-01-02T00:00:00Z" },
    { id: "3", kind: "post", text: "nothing", links: ["https://example.com/page"], deletedAt: "2026-01-03T00:00:00Z" },
  ]);
  assert.deepEqual(XHistory.search(recs, "hello").map((r) => r.id), ["2", "1"]);
  assert.deepEqual(XHistory.search(recs, "hello world").map((r) => r.id), ["1"]);
  assert.deepEqual(XHistory.search(recs, "friend").map((r) => r.id), ["2"]);
  assert.deepEqual(XHistory.search(recs, "example.com").map((r) => r.id), ["3"]);
  assert.deepEqual(XHistory.search(recs, "", "reply").map((r) => r.id), ["2"]);
  assert.deepEqual(XHistory.search(recs, "  ", "all").length, 3);
  assert.deepEqual(XHistory.countByKind(recs), { post: 2, reply: 1, repost: 0, like: 0 });
});

test("toJSON wraps the records with the account and the export date", () => {
  const recs = XHistory.arrange([{ id: "1", kind: "post", text: "hi", deletedAt: "2026-01-01T00:00:00Z" }]);
  const doc = JSON.parse(
    XHistory.toJSON(recs, { account: { id: "77", handle: "me" }, exportedAt: deletedAt, version: "0.2.0" })
  );
  assert.equal(doc.app, "X Cleaner");
  assert.equal(doc.kind, "deletion-history");
  assert.equal(doc.version, "0.2.0");
  assert.equal(doc.exportedAt, "2026-10-20T12:00:00.000Z");
  assert.deepEqual(doc.account, { id: "77", handle: "me" });
  assert.equal(doc.count, 1);
  assert.deepEqual(doc.items, recs);
});

test("toCSV quotes commas, quotes and line breaks, and guards formulas", () => {
  const recs = XHistory.arrange([
    {
      id: "2",
      kind: "reply",
      text: '@friend said "yes",\nthen left',
      replyTo: { id: "9", user: "friend" },
      media: [{ type: "photo", url: "https://p/1" }, { type: "photo", url: "https://p/2" }],
      deletedAt: "2026-01-02T00:00:00Z",
    },
    { id: "1", kind: "post", text: "=SUM(A1)", createdAt: "2019-03-04T12:00:00Z", deletedAt: "2026-01-01T00:00:00Z" },
  ]);
  const csv = XHistory.toCSV(recs);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "deleted_at,created_at,type,id,url,text,media,links,reply_to,repost_of");
  // The line break inside the text stays inside its quoted cell; rows end with CRLF.
  assert.equal(lines.length, 4);
  assert.equal(
    lines[1],
    '2026-01-02T00:00:00.000Z,,reply,2,https://x.com/i/status/2,"\'@friend said ""yes"",\nthen left",https://p/1 https://p/2,,https://x.com/i/status/9,'
  );
  assert.equal(lines[2], "2026-01-01T00:00:00.000Z,2019-03-04T12:00:00.000Z,post,1,https://x.com/i/status/1,'=SUM(A1),,,,");
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(XHistory.toCSV([]), "deleted_at,created_at,type,id,url,text,media,links,reply_to,repost_of\r\n");
});

// An in-memory stand-in for chrome.storage.local, with the same promise-based get/set/remove.
function memoryStore() {
  const data = {};
  const pick = (keys) => {
    if (keys == null) return { ...data };
    const out = {};
    for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
    return out;
  };
  return {
    data,
    writes: 0,
    async get(keys) {
      return pick(keys);
    },
    async set(obj) {
      this.writes++;
      Object.assign(data, structuredClone(obj));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
  };
}

const rec = (i) => ({ id: String(1000 + i), kind: "post", text: "post " + i, deletedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) });

test("append splits the history into chunks and load reads it back, newest first", async () => {
  const store = memoryStore();
  const n = XHistory.CHUNK + 10;
  for (let i = 0; i < n; i++) await XHistory.append("77", [rec(i)], { handle: "me" }, store);
  const meta = await XHistory.readMeta("77", store);
  assert.equal(meta.count, n);
  assert.equal(meta.chunks, 2);
  assert.equal(meta.handle, "me");
  assert.equal(store.data["xcleaner.history.77.0"].length, XHistory.CHUNK);
  assert.equal(store.data["xcleaner.history.77.1"].length, 10);
  const all = await XHistory.load("77", store);
  assert.equal(all.length, n);
  assert.equal(all[0].id, String(1000 + n - 1));
  assert.equal(all.at(-1).id, "1000");
});

test("append writes a big batch across several chunks in one go", async () => {
  const store = memoryStore();
  const batch = Array.from({ length: XHistory.CHUNK * 2 + 1 }, (_, i) => rec(i));
  await XHistory.append("77", batch, {}, store);
  assert.equal(store.writes, 1);
  assert.equal((await XHistory.readMeta("77", store)).chunks, 3);
  assert.equal((await XHistory.load("77", store)).length, batch.length);
});

test("accounts lists the ones with a history, and clear removes one entirely", async () => {
  const store = memoryStore();
  store.data["xcleaner.progress.77"] = ["1"]; // other keys are ignored
  await XHistory.append("77", [rec(1)], { handle: "first" }, store);
  await new Promise((r) => setTimeout(r, 5));
  await XHistory.append("88", [rec(2), rec(3)], { handle: "second" }, store);
  const list = await XHistory.accounts(store);
  assert.deepEqual(list.map((a) => [a.id, a.handle, a.count]), [["88", "second", 2], ["77", "first", 1]]);

  await XHistory.clear("88", store);
  assert.deepEqual(Object.keys(store.data).sort(), ["xcleaner.history.77", "xcleaner.history.77.0", "xcleaner.progress.77"]);
  assert.deepEqual(await XHistory.load("88", store), []);
  assert.ok(XHistory.touches("77", "xcleaner.history.77.0"));
  assert.ok(!XHistory.touches("7", "xcleaner.history.77"));
});
