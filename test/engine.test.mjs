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
