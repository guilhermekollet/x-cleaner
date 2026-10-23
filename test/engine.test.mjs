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
  assert.deepEqual(data["xcleaner.scanmeta.77"].done, ["UserOriginalsTimeline"]);

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

test("snapshots carry the last few deleted items, newest first, not the ones already gone", async () => {
  const { deleted } = stubs();
  globalThis.XApi.deletePost = async (id) => (deleted.push(id), { outcome: id === "3" ? "gone" : "ok" });
  const items = ["1", "2", "3", "4", "5", "6"].map((id) => ({ ...post(id), text: "text " + id }));
  const final = await XEngine.start({ ...base, source: "archive", archiveItems: items, speed: fast, limit: Infinity, order: "oldest", resume: false });
  assert.deepEqual(final.recent.map((r) => r.id), ["6", "5", "4", "2"]);
  assert.deepEqual(final.recent[0], { id: "6", kind: "post", text: "text 6", createdAt: "Mon Mar 04 12:00:00 +0000 2019", replyTo: null, author: null });
});

// --- What the profile still lists hasn't been deleted -------------------------------------------
const newestPosts = (over) => ({
  ...base,
  types: { post: true, reply: false, repost: false, like: false },
  source: "timeline",
  speed: fast,
  limit: Infinity,
  order: "newest",
  resume: true,
  ...over,
});

test("a post the profile still lists is tried again, even if an earlier run marked it done", async () => {
  const { deleted, data } = stubs({ pages: [["90", "80", "70"].map(post)] });
  // An earlier run marked 90 (as now) and 80 (a bare id, as before 0.3.3) done, yet both are listed.
  data["xcleaner.done.77"] = { chunks: 1 };
  data["xcleaner.done.77.0"] = ["post:90", "80"];
  const final = await XEngine.start(newestPosts());
  assert.deepEqual([...deleted].sort(), ["70", "80", "90"]);
  assert.equal(final.deleted, 3);
  assert.equal(final.seen, 3);
});

test("a post that keeps failing is tried once per run, not in a loop", async () => {
  const { data } = stubs({ pages: [["90"].map(post)] });
  let tries = 0;
  globalThis.XApi.deletePost = async () => (tries++, { outcome: "error", message: "nope" });
  const final = await XEngine.start(newestPosts());
  assert.equal(tries, 1);
  assert.equal(final.failures, 1);
  // It is marked done for now; the next run sees it listed and tries it again.
  assert.ok(data["xcleaner.done.77.0"].includes("post:90"));
  await XEngine.start(newestPosts());
  assert.equal(tries, 2);
});

test("a profile that lists nothing ends with nothing seen, so the popup can say so", async () => {
  stubs({ pages: [] });
  const final = await XEngine.start(newestPosts());
  assert.equal(final.seen, 0);
  assert.equal(final.deleted + final.gone + final.failures, 0);
  assert.equal(final.fatal, null);
});

test("oldest first: a fresh read retries what an earlier run marked done but is still listed", async () => {
  const { deleted, data } = stubs({ pages: [["90", "80"].map(post)] });
  data["xcleaner.done.77"] = { chunks: 1 };
  data["xcleaner.done.77.0"] = ["post:80"];
  const final = await XEngine.start(newestPosts({ order: "oldest" }));
  assert.deepEqual(deleted, ["80", "90"]);
  assert.equal(final.seen, 2);
});

test("timeline items count by their own kind, not by the tab they were found on", async () => {
  // As on a real profile: Posts lists a thread reply (a "reply"), Replies lists a reply X sent
  // without "in reply to" (a "post"). Neither may be dropped for being on the "wrong" tab.
  const { data } = stubs();
  const deleted = [];
  const byOp = {
    UserOriginalsTimeline: [{ ...post("90"), kind: "reply" }],
    UserRepliesTimeline: [{ ...post("80"), kind: "post" }],
  };
  globalThis.XApi.deletePost = async (id) => (deleted.push(id), { outcome: "ok" });
  globalThis.XApi.profilePage = async (op) => ({
    status: 200,
    items: (byOp[op] || []).filter((it) => !deleted.includes(it.id)),
    bottom: null,
    postCount: null,
  });
  const cfg = { ...base, types: { post: true, reply: true, repost: true, like: false }, source: "timeline", speed: fast, limit: Infinity, resume: false };
  const newest = await XEngine.start({ ...cfg, order: "newest" });
  assert.deepEqual([...deleted].sort(), ["80", "90"]);
  assert.equal(newest.seen, 2);

  deleted.length = 0;
  delete data["xcleaner.scan.77"];
  const oldest = await XEngine.start({ ...cfg, order: "oldest" });
  assert.deepEqual([...deleted].sort(), ["80", "90"]);
  assert.equal(oldest.seen, 2);
});

test("choosing only posts still leaves replies alone, whichever tab they are on", async () => {
  stubs();
  const deleted = [];
  globalThis.XApi.deletePost = async (id) => (deleted.push(id), { outcome: "ok" });
  globalThis.XApi.profilePage = async (op) => ({
    status: 200,
    items: (op === "UserOriginalsTimeline" ? [post("90"), { ...post("70"), kind: "reply" }] : [{ ...post("80"), kind: "reply" }]).filter((it) => !deleted.includes(it.id)),
    bottom: null,
    postCount: null,
  });
  await XEngine.start({ ...base, types: { post: true, reply: false, repost: false, like: false }, source: "timeline", speed: fast, limit: Infinity, order: "newest", resume: false });
  assert.deepEqual(deleted, ["90"]);
});

test("posts are read where the profile page reads them, and from UserTweets if that route is gone", async () => {
  // As on a real account: UserTweets comes back empty while the Posts tab lists posts.
  stubs();
  const deleted = [];
  const reads = [];
  globalThis.XApi.deletePost = async (id) => (deleted.push(id), { outcome: "ok" });
  globalThis.XApi.profilePage = async (op) => {
    reads.push(op);
    const items = op === "UserOriginalsTimeline" ? [post("90"), post("80")] : [];
    return { status: 200, items: items.filter((it) => !deleted.includes(it.id)), bottom: null, postCount: null };
  };
  const cfg = { ...base, types: { post: true, reply: false, repost: false, like: false }, source: "timeline", speed: fast, limit: Infinity, order: "newest", resume: false };
  await XEngine.start(cfg);
  assert.deepEqual([...deleted].sort(), ["80", "90"]);
  assert.ok(!reads.includes("UserTweets"));

  // A bundle without UserOriginalsTimeline falls back to UserTweets.
  stubs();
  deleted.length = 0;
  reads.length = 0;
  globalThis.XApi.deletePost = async (id) => (deleted.push(id), { outcome: "ok" });
  globalThis.XApi.profilePage = async (op) => {
    reads.push(op);
    if (op === "UserOriginalsTimeline") throw new Error("operation-missing:UserOriginalsTimeline");
    const items = op === "UserTweets" ? [post("70")] : [];
    return { status: 200, items: items.filter((it) => !deleted.includes(it.id)), bottom: null, postCount: null };
  };
  await XEngine.start(cfg);
  assert.deepEqual(deleted, ["70"]);
  assert.ok(reads.includes("UserTweets"));
});

test("pages X leaves empty where deleted posts were do not end the read early", async () => {
  // After a lot has been deleted, the top of the profile comes back as several empty pages.
  const empty = Array.from({ length: 10 }, () => []);
  const pages = [...empty, ["90", "80"].map(post)];
  const { deleted } = stubs({ pages });
  await XEngine.start(timelineCfg({ order: "newest" }));
  assert.deepEqual([...deleted].sort(), ["80", "90"]);

  const again = stubs({ pages: [...empty, ["70"].map(post)] });
  await XEngine.start(timelineCfg({ order: "oldest" }));
  assert.deepEqual(again.deleted, ["70"]);
});

test("likes are undone from the Likes tab, without the archive", async () => {
  stubs();
  const undone = [];
  const reads = [];
  globalThis.XApi.removeLike = async (id) => (undone.push(id), { outcome: "ok" });
  globalThis.XApi.deletePost = async () => assert.fail("a like must not delete a post");
  globalThis.XApi.profilePage = async (op) => {
    reads.push(op);
    const items = op === "Likes" ? ["50", "40"].map((id) => ({ id, kind: "like", createdAt: null, text: "", url: `https://x.com/someone/status/${id}` })) : [];
    return { status: 200, items: items.filter((it) => !undone.includes(it.id)), bottom: null, postCount: null };
  };
  const final = await XEngine.start({ ...base, types: { post: false, reply: false, repost: false, like: true }, source: "timeline", speed: fast, limit: Infinity, order: "newest", resume: false });
  assert.deepEqual([...undone].sort(), ["40", "50"]);
  assert.equal(final.recent[0].author, "someone");
  assert.deepEqual([...new Set(reads)], ["Likes"]);
});

test("with a date filter the Likes tab is not read: likes have no date", async () => {
  stubs();
  const reads = [];
  globalThis.XApi.removeLike = async () => assert.fail("no like matches a date filter");
  globalThis.XApi.profilePage = async (op) => {
    reads.push(op);
    return { status: 200, items: op === "Likes" ? [{ id: "50", kind: "like", createdAt: null, text: "", url: null }] : [], bottom: null, postCount: null };
  };
  const cfg = { ...base, types: { post: true, reply: false, repost: false, like: true }, source: "timeline", speed: fast, limit: Infinity, resume: false, since: new Date("2020-01-01") };
  await XEngine.start({ ...cfg, order: "newest" });
  await XEngine.start({ ...cfg, order: "oldest" });
  assert.ok(!reads.includes("Likes"));
  assert.ok(reads.includes("UserOriginalsTimeline"));
});
