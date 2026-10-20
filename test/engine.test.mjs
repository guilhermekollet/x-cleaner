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
