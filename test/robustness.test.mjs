// Tests for how a run holds up when things go wrong: X failing for a moment or for a while, the
// connection dropping, X's API moving, a run starting badly, progress that grows large, and the
// inputs that select what to delete. Run with `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XEngine = require("../src/engine.js");
const XRun = require("../src/run-state.js");
XEngine._timing.backoffBase = 1; // retries wait milliseconds here, not seconds

const fast = { minDelay: 0, maxDelay: 0, batchSize: 1000, batchPause: 0 };
const post = (id, kind = "post") => ({ id, kind, createdAt: "Mon Mar 04 12:00:00 +0000 2019", text: "p" + id });
const base = { types: { post: true, reply: true, repost: true, like: true }, keepIds: new Set(), keyword: null, since: null, until: null };
const archiveCfg = (archiveItems, over) => ({ ...base, source: "archive", archiveItems, speed: fast, limit: Infinity, resume: false, ...over });

// An in-memory chrome.storage.local, and an XApi whose deletePost answers from `answer(id, n)`
// (n: how many times this id was tried).
function stubs({ answer = () => ({ outcome: "ok" }), pages = [], pageAnswer = null } = {}) {
  const data = {};
  const writes = [];
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
          return out;
        },
        async set(obj) {
          writes.push(Object.keys(obj));
          Object.assign(data, structuredClone(obj));
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete data[k];
        },
      },
    },
  };
  require("../src/history.js");
  const tries = {};
  const deleted = [];
  const reads = [];
  globalThis.XApi = {
    userId: () => "77",
    ensureMeta: async () => ({}),
    deletePost: async (id) => {
      tries[id] = (tries[id] || 0) + 1;
      const res = await answer(id, tries[id]);
      if (res.outcome === "ok") deleted.push(id);
      return res;
    },
    removeLike: async (id) => (deleted.push("like:" + id), { outcome: "ok" }),
    profilePage: async (op, cursor) => {
      reads.push(cursor);
      if (pageAnswer) {
        const special = pageAnswer(cursor, reads.length);
        if (special) return special;
      }
      const i = cursor ? Number(cursor) : 0;
      const page = pages[i] || [];
      return { status: 200, items: page.filter((it) => !deleted.includes(it.id)), bottom: i + 1 < pages.length ? String(i + 1) : null };
    },
  };
  return { data, writes, tries, deleted, reads };
}

// --- Passing failures -----------------------------------------------------------------------

test("a dropped connection is retried, not fatal", async () => {
  const { deleted, tries } = stubs({
    answer: (id, n) => {
      if (id === "2" && n < 3) throw new Error("Failed to fetch");
      return { outcome: "ok" };
    },
  });
  const final = await XEngine.start(archiveCfg(["3", "2", "1"].map((id) => post(id))));
  assert.equal(final.fatal, null);
  assert.deepEqual(deleted.sort(), ["1", "2", "3"]);
  assert.equal(tries["2"], 3);
  assert.equal(final.failures, 0);
});

test("X failing for a moment (5xx) is retried and the item is not written off", async () => {
  const { deleted } = stubs({ answer: (id, n) => (id === "1" && n < 4 ? { outcome: "transient" } : { outcome: "ok" }) });
  const final = await XEngine.start(archiveCfg([post("1")]));
  assert.deepEqual(deleted, ["1"]);
  assert.equal(final.failures, 0);
});

test("X failing on and on pauses the run by itself, with nothing written off", async () => {
  const { data } = stubs({ answer: () => ({ outcome: "transient" }) });
  let stalled = false;
  const final = await XEngine.start(archiveCfg([post("1"), post("2")]), (s) => {
    if (s.stalled === "errors" && s.paused && !stalled) {
      stalled = true;
      XEngine.stop();
    }
  });
  assert.equal(stalled, true);
  assert.equal(final.stopped, true);
  assert.equal(final.deleted, 0);
  assert.equal(final.failures, 0);
  assert.deepEqual(data["xcleaner.done.77"] ? data["xcleaner.done.77.0"] : [], []);
});

test("errors on item after item pause the run and give those items another chance", async () => {
  const { data } = stubs({ answer: () => ({ outcome: "error", message: "something" }) });
  const items = Array.from({ length: 12 }, (_, i) => post(String(100 + i)));
  let stalled = false;
  await XEngine.start(archiveCfg(items, { resume: true }), (s) => {
    if (s.stalled === "errors" && !stalled) {
      stalled = true;
      XEngine.stop();
    }
  });
  assert.equal(stalled, true);
  // The 8 failures in a row were taken back: none of them is recorded as done.
  const done = (data["xcleaner.done.77.0"] || []).filter((k) => k.startsWith("post:"));
  assert.deepEqual(done, []);
});

test("a single item that fails is counted and skipped; the run goes on", async () => {
  const { deleted } = stubs({ answer: (id) => (id === "2" ? { outcome: "error", message: "nope" } : { outcome: "ok" }) });
  const final = await XEngine.start(archiveCfg(["3", "2", "1"].map((id) => post(id))));
  assert.equal(final.failures, 1);
  assert.deepEqual(deleted.sort(), ["1", "3"]);
});

// --- Starting -----------------------------------------------------------------------------------

test("a run that cannot start ends with the reason instead of hanging", async () => {
  stubs();
  XApi.ensureMeta = async () => {
    throw new Error("bundle-not-found");
  };
  const final = await XEngine.start(archiveCfg([post("1")]));
  assert.equal(final.fatal, "bundle-not-found");
  assert.equal(XEngine.isRunning(), false);
});

test("a second start while one is starting is refused", async () => {
  stubs();
  const first = XEngine.start(archiveCfg([post("1")]));
  assert.equal(XEngine.isRunning(), true); // set before the first await
  await assert.rejects(XEngine.start(archiveCfg([post("2")])), /already-running/);
  await first;
});

// --- What counts as done ------------------------------------------------------------------------

test("a post you liked yourself is still deleted when only posts are selected", async () => {
  const { deleted } = stubs();
  const items = [post("5", "like"), post("5", "post")];
  await XEngine.start(archiveCfg(items, { types: { post: true, reply: false, repost: false, like: false } }));
  assert.deepEqual(deleted, ["5"]);
});

test("progress saved by older versions (bare ids) still counts, and is moved over", async () => {
  const { data, deleted } = stubs();
  data["xcleaner.progress.77"] = ["10"];
  await XEngine.start(archiveCfg([post("10"), post("11")], { resume: true }));
  assert.deepEqual(deleted, ["11"]);
  assert.equal(data["xcleaner.progress.77"], undefined);
  assert.deepEqual(data["xcleaner.done.77.0"].sort(), ["10", "post:11"]);
});

test("progress is saved in chunks, and a save writes only the newest one", async () => {
  const store = (() => {
    const data = {};
    const writes = [];
    return {
      data,
      writes,
      async get(keys) {
        const out = {};
        for (const k of [].concat(keys)) if (k in data) out[k] = structuredClone(data[k]);
        return out;
      },
      async set(obj) {
        writes.push(Object.keys(obj).sort());
        Object.assign(data, structuredClone(obj));
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete data[k];
      },
    };
  })();
  const p = { keys: Array.from({ length: 2500 }, (_, i) => "post:" + i), savedLen: 0, chunks: 0, dirtyFrom: null, legacy: false };
  await XEngine._saveProgress("77", p, store);
  assert.deepEqual(store.writes.at(-1), ["xcleaner.done.77", "xcleaner.done.77.0", "xcleaner.done.77.1", "xcleaner.done.77.2"]);
  p.keys.push("post:a", "post:b");
  await XEngine._saveProgress("77", p, store);
  assert.deepEqual(store.writes.at(-1), ["xcleaner.done.77", "xcleaner.done.77.2"]);
  const back = await XEngine._loadProgress("77", store);
  assert.equal(back.keys.length, 2502);
  assert.equal(back.chunks, 3);
  await XEngine._clearProgress("77", store);
  assert.deepEqual(Object.keys(store.data), []);
});

// --- Reading the timeline -----------------------------------------------------------------------

const timelineCfg = (over) => ({ ...base, types: { post: true, reply: false, repost: false, like: false }, source: "timeline", speed: fast, limit: Infinity, resume: false, ...over });

test("a timeline page that fails for a moment is read again, not taken as the end", async () => {
  const pages = [[post("90"), post("80")], [post("70")]];
  const { deleted } = stubs({
    pages,
    // The second read fails twice: no answer, then a 200 without data.
    pageAnswer: (cursor, n) => (n === 1 ? { status: 0, items: [], bottom: null, transient: true } : n === 2 ? { status: 200, items: [], bottom: null, transient: true } : null),
  });
  const final = await XEngine.start(timelineCfg());
  assert.equal(final.fatal, null);
  assert.deepEqual(deleted.sort(), ["70", "80", "90"]);
});

test("newest first keeps its place: after deleting on a page it reads that page again, not the top", async () => {
  // Page 0 has only reposts (not selected), page 1 the posts to delete.
  const pages = [[post("99", "repost"), post("98", "repost")], [post("50"), post("40")]];
  const { reads, deleted } = stubs({ pages });
  await XEngine.start(timelineCfg());
  assert.deepEqual(deleted.sort(), ["40", "50"]);
  assert.deepEqual(reads, [null, "1", "1"]);
});

test("oldest first: a passing failure mid-read keeps the cursor and the read goes to the end", async () => {
  const pages = [[post("90"), post("80")], [post("70"), post("60")], [post("50")]];
  const { deleted, reads } = stubs({
    pages,
    pageAnswer: (cursor, n) => (n === 2 ? { status: 503, items: [], bottom: null, transient: true } : null),
  });
  await XEngine.start(timelineCfg({ order: "oldest", limit: 1 }));
  assert.deepEqual(reads, [null, "1", "1", "2"]);
  assert.deepEqual(deleted, ["50"]); // the true oldest, not the oldest of a cut-short read
});

// --- Selecting ------------------------------------------------------------------------------

test("the keep list takes ids and links to posts", () => {
  assert.deepEqual(XRun.parseKeepIds("123456789, https://x.com/me/status/1850000000000000001\nhttps://twitter.com/me/statuses/42 nonsense"), [
    "123456789",
    "1850000000000000001",
    "42",
  ]);
  assert.deepEqual(XRun.parseKeepIds(""), []);
  assert.deepEqual(XRun.parseKeepIds("7 7"), ["7"]);
});

test("the date filter runs from local midnight to the local midnight after the last day", () => {
  const { since, until } = XRun.dateBounds("2024-03-01", "2024-03-05");
  assert.equal(since, new Date(2024, 2, 1).toISOString());
  assert.equal(until, new Date(2024, 2, 6).toISOString());
  assert.deepEqual(XRun.dateBounds("", ""), { since: null, until: null });
});
