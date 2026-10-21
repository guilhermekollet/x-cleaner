// Tests for the saved run record: which settings are kept, what the popup offers for each state of
// a run, and the config a continued run starts with. Run with `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XRun = require("../src/run-state.js");

const settings = { source: "timeline", types: { post: true }, speed: "normal", limit: "500", order: "oldest", test: false, tabId: 7, staged: false };
const record = (over) => ({ settings, status: "running", deleted: 120, gone: 3, failures: 1, limitReached: false, ...over });

test("settingsFrom keeps the run's settings, not the archive items or the resume flag", () => {
  const kept = XRun.settingsFrom({ ...settings, archiveItems: [{ id: "1" }], resume: true });
  assert.deepEqual(kept, settings);
  assert.deepEqual(XRun.settingsFrom(null), {});
});

test("offer continues interrupted, stopped and failed runs, counting what is done", () => {
  assert.deepEqual(XRun.offer(record()), { kind: "interrupted", n: 123 });
  assert.deepEqual(XRun.offer(record({ status: "stopped" })), { kind: "stopped", n: 123 });
  assert.deepEqual(XRun.offer(record({ status: "failed" })), { kind: "failed", n: 123 });
});

test("offer starts the next batch only after a full one", () => {
  assert.deepEqual(XRun.offer(record({ status: "finished", limitReached: true })), { kind: "batch", n: 123 });
  assert.equal(XRun.offer(record({ status: "finished", limitReached: false })), null);
});

test("offer leaves alone tests, dismissed runs and runs still going in another tab", () => {
  assert.equal(XRun.offer(record({ settings: { ...settings, test: true } })), null);
  assert.equal(XRun.offer(record({ status: "dismissed" })), null);
  assert.equal(XRun.offer(record(), { activeElsewhere: true }), null);
  assert.equal(XRun.offer(record({ status: "stopped" }), { activeElsewhere: true }).kind, "stopped");
  assert.equal(XRun.offer(null), null);
  assert.equal(XRun.offer({ status: "running" }), null);
});

test("continueConfig repeats the settings, skipping what is done, never as a test", () => {
  const cfg = XRun.continueConfig(record({ settings: { ...settings, test: true } }));
  assert.equal(cfg.resume, true);
  assert.equal(cfg.test, false);
  assert.equal(cfg.order, "oldest");
  assert.equal(cfg.limit, "500");
});

test("key is per account", () => {
  assert.equal(XRun.key("77"), "xcleaner.run.77");
});
