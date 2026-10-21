// Tests for the engine's filtering: which items a run will act on, given the chosen
// types, the keep list, a keyword and a date range. Run with `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XEngine = require("../src/engine.js");
const matches = XEngine._matchesFilters;

const base = {
  types: { post: true, reply: true, repost: true, like: true },
  keepIds: new Set(),
  keyword: null,
  since: null,
  until: null,
};
const item = (over) => ({ id: "1", kind: "post", createdAt: "Mon Mar 04 12:00:00 +0000 2019", text: "hello world", ...over });

test("type toggles decide what is included", () => {
  assert.equal(matches(item({ kind: "repost" }), { ...base, types: { ...base.types, repost: false } }), false);
  assert.equal(matches(item({ kind: "reply" }), base), true);
});

test("kept ids are never acted on", () => {
  assert.equal(matches(item({ id: "42" }), { ...base, keepIds: new Set(["42"]) }), false);
});

test("keyword filters by text, case-insensitively", () => {
  assert.equal(matches(item({ text: "Hello World" }), { ...base, keyword: "world" }), true);
  assert.equal(matches(item({ text: "nothing" }), { ...base, keyword: "world" }), false);
});

test("date range is inclusive of since and exclusive of until", () => {
  const since = new Date("2019-03-01T00:00:00Z");
  const until = new Date("2019-03-05T00:00:00Z");
  assert.equal(matches(item(), { ...base, since, until }), true);
  assert.equal(matches(item({ createdAt: "Mon Feb 25 12:00:00 +0000 2019" }), { ...base, since, until }), false);
});

test("an item without a date is excluded when a date filter is set", () => {
  assert.equal(matches(item({ createdAt: null }), { ...base, since: new Date("2019-01-01") }), false);
  assert.equal(matches(item({ createdAt: null }), base), true);
});

test("a run adds what it deletes to the history, and only that", async () => {
  const data = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
          return out;
        },
        async set(obj) {
          Object.assign(data, structuredClone(obj));
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete data[k];
        },
      },
    },
  };
  const XHistory = require("../src/history.js");
  const outcomes = { 1: "ok", 2: "gone", 3: "ok" };
  globalThis.XApi = {
    userId: () => "77",
    ensureMeta: async () => ({}),
    deletePost: async (id) => ({ outcome: outcomes[id] }),
    removeLike: async (id) => ({ outcome: outcomes[id] }),
  };
  const items = [
    { id: "1", kind: "post", createdAt: "Mon Mar 04 12:00:00 +0000 2019", text: "first, in full", media: [], links: [] },
    { id: "2", kind: "reply", createdAt: "Mon Mar 04 12:00:00 +0000 2019", text: "already gone" },
    { id: "3", kind: "like", createdAt: null, text: "liked", url: "https://twitter.com/i/web/status/3" },
  ];
  const final = await XEngine.start({
    ...base,
    source: "archive",
    archiveItems: items,
    speed: { minDelay: 0, maxDelay: 0, batchSize: 1000, batchPause: 0 },
    limit: Infinity,
    resume: false,
    handle: "me",
  });
  assert.equal(final.deleted, 2);
  assert.equal(final.gone, 1);
  assert.equal(final.historyErrors, 0);
  const history = await XHistory.load("77", chrome.storage.local);
  assert.deepEqual(history.map((r) => [r.kind, r.id]).sort(), [["like", "3"], ["post", "1"]]);
  assert.equal(history.find((r) => r.id === "1").text, "first, in full");
  assert.equal(history.find((r) => r.id === "1").source, "archive");
  assert.equal((await XHistory.readMeta("77", chrome.storage.local)).handle, "me");
});

test("orderItems sorts by id, newest or oldest first, one entry per id", () => {
  const items = [{ id: "100" }, { id: "9" }, { id: "1850000000000000000" }, { id: "100" }];
  assert.deepEqual(XEngine._orderItems(items, "newest").map((i) => i.id), ["1850000000000000000", "100", "9"]);
  assert.deepEqual(XEngine._orderItems(items, "oldest").map((i) => i.id), ["9", "100", "1850000000000000000"]);
});

// A fresh in-memory chrome.storage.local and an XApi stub that records what it deletes.
function stubs({ pages = [], postCount = null, onRead = null } = {}) {
  const data = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
          return out;
        },
        async set(obj) {
          Object.assign(data, structuredClone(obj));
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete data[k];
        },
      },
    },
  };
  const deleted = [];
  const reads = [];
  globalThis.XApi = {
    userId: () => "77",
    ensureMeta: async () => ({}),
    deletePost: async (id) => (deleted.push(id), { outcome: "ok" }),
    removeLike: async (id) => (deleted.push(id), { outcome: "ok" }),
    // Pages of the profile, newest first, chained by cursor.
    profilePage: async (op, cursor) => {
      reads.push([op, cursor]);
      if (onRead) onRead(reads.length);
      const i = cursor ? Number(cursor) : 0;
      const page = pages[i];
      if (!page) return { status: 200, items: [], bottom: null, postCount };
      return {
        status: 200,
        items: page.filter((it) => !deleted.includes(it.id)),
        bottom: i + 1 < pages.length ? String(i + 1) : null,
        postCount,
      };
    },
  };
  return { deleted, reads, data };
}

const fast = { minDelay: 0, maxDelay: 0, batchSize: 1000, batchPause: 0 };
const post = (id) => ({ id, kind: "post", createdAt: "Mon Mar 04 12:00:00 +0000 2019", text: "p" + id });

test("an archive run in batches, oldest first: stops when the batch fills, the next one continues", async () => {
  const { deleted } = stubs();
  const archiveItems = ["50", "40", "30", "20", "10"].map(post);
  const cfg = { ...base, source: "archive", archiveItems, speed: fast, limit: 2, order: "oldest", resume: false };
  const first = await XEngine.start(cfg);
  assert.deepEqual(deleted, ["10", "20"]);
  assert.equal(first.limitReached, true);
  assert.equal(first.total, 5);

  const second = await XEngine.start({ ...cfg, resume: true });
  assert.deepEqual(deleted, ["10", "20", "30", "40"]);
  assert.equal(second.limitReached, true);

  const last = await XEngine.start({ ...cfg, resume: true });
  assert.deepEqual(deleted, ["10", "20", "30", "40", "50"]);
  assert.equal(last.limitReached, false); // ran out before the batch filled
});

test("a timeline run oldest first reads the whole profile, then deletes from the bottom", async () => {
  const pages = [["90", "80"].map(post), ["70", "60"].map(post)];
  const { deleted, reads } = stubs({ pages });
  const progress = [];
  const final = await XEngine.start(
    { ...base, types: { post: true, reply: false, repost: false, like: false }, source: "timeline", speed: fast, limit: 3, order: "oldest", resume: false },
    (s) => progress.push(s)
  );
  assert.deepEqual(reads.map(([, c]) => c), [null, "1"]); // every page read before deleting
  assert.deepEqual(deleted, ["60", "70", "80"]);
  assert.equal(final.limitReached, true);
  assert.ok(progress.some((s) => s.scanning && s.found === 4));
});

test("a run without a batch limit never reports a full batch", async () => {
  stubs();
  const final = await XEngine.start({ ...base, source: "archive", archiveItems: [post("1")], speed: fast, limit: Infinity, resume: false });
  assert.equal(final.limitReached, false);
});

const timelineCfg = (over) => ({
  ...base,
  types: { post: true, reply: false, repost: false, like: false },
  source: "timeline",
  speed: fast,
  order: "oldest",
  resume: false,
  ...over,
});

test("the profile read is kept: the next batch deletes at once, without reading again", async () => {
  const pages = [["90", "80"].map(post), ["70", "60"].map(post)];
  const { deleted, reads, data } = stubs({ pages, postCount: 4 });
  const progress = [];
  await XEngine.start(timelineCfg({ limit: 2 }), (s) => progress.push(s));
  assert.deepEqual(deleted, ["60", "70"]);
  assert.equal(reads.length, 2);
  assert.ok(progress.some((s) => s.scanning && s.scanTotal === 4));
  // The deleted ones are pruned from the saved read.
  assert.deepEqual(data["xcleaner.scan.77"].items.map((i) => i.id).sort(), ["80", "90"]);
  assert.deepEqual(data["xcleaner.scanmeta.77"].done, ["UserTweets"]);

  await XEngine.start(timelineCfg({ limit: 2, resume: true }));
  assert.deepEqual(deleted, ["60", "70", "80", "90"]);
  assert.equal(reads.length, 2); // no new reads
});

test("a read that was stopped picks up from where it stopped", async () => {
  const pages = [["90", "80"].map(post), ["70", "60"].map(post), ["50"].map(post)];
  const { deleted, reads } = stubs({ pages, onRead: (n) => n === 2 && XEngine.stop() });
  const first = await XEngine.start(timelineCfg({ limit: 10 }));
  assert.equal(first.stopped, true);
  assert.equal(first.scanning, true); // stopped during the read
  assert.deepEqual(deleted, []);

  await XEngine.start(timelineCfg({ limit: 10 }));
  // The page that arrived as it stopped is kept, so the next read starts at the page after it.
  assert.deepEqual(reads.map(([, c]) => c), [null, "1", "2"]);
  assert.deepEqual(deleted, ["50", "60", "70", "80", "90"]);
});

test("a finished read with nothing left is read again, for newer posts", async () => {
  const pages = [["20", "10"].map(post)];
  const { deleted, reads } = stubs({ pages });
  await XEngine.start(timelineCfg({ limit: 10 }));
  assert.deepEqual(deleted, ["10", "20"]);
  pages[0] = ["30"].map(post); // a new post since
  await XEngine.start(timelineCfg({ limit: 10 }));
  assert.deepEqual(deleted, ["10", "20", "30"]);
  assert.equal(reads.length, 2);
});
