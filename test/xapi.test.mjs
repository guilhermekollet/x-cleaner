// Tests for the x.com client's judgment of answers (what is done, gone, worth retrying, or a real
// failure) and for how it copes with X moving its API or the connection dropping. Run with
// `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
globalThis.location = { origin: "https://x.com" };
let bundle = 'queryId:"Q1",operationName:"DeleteTweet",operationType:"mutation",metadata:{featureSwitches:[],fieldToggles:[]}';
let bundleReads = 0;
globalThis.document = {
  cookie: "twid=u%3D77; ct0=abc",
  querySelectorAll: (sel) => (sel === "script[src]" ? [{ src: "https://abs.twimg.com/main.abc123.js" }] : []),
};
require("../src/history.js");
const XApi = require("../src/x-api.js");
const classify = XApi._classify;
const answer = (status, body) => ({ status, body, rate: {} });

test("classify: done, gone, limited, session", () => {
  assert.equal(classify(answer(200, { data: { delete_tweet: {} } }), {}).outcome, "ok");
  assert.equal(classify(answer(200, { errors: [{ code: 144, message: "No status found with that ID." }] })).outcome, "gone");
  assert.equal(classify(answer(429, null)).outcome, "limited");
  assert.equal(classify(answer(200, { errors: [{ code: 88 }] })).outcome, "limited");
  assert.equal(classify(answer(403, null)).outcome, "auth");
});

test("classify: no answer, 5xx, an empty body or over capacity are passing failures", () => {
  assert.equal(classify({ status: 0, body: null, error: "Failed to fetch" }).outcome, "transient");
  assert.equal(classify(answer(503, null)).outcome, "transient");
  assert.equal(classify(answer(200, null)).outcome, "transient");
  assert.equal(classify(answer(200, { errors: [{ code: 130, message: "Over capacity" }] })).outcome, "transient");
});

test("classify: a 404 is the API changing, never 'already gone'", () => {
  assert.equal(classify(answer(404, { errors: [{ message: "Not found" }] })).outcome, "auth");
});

test("classify: an error about the item is a failure of that item", () => {
  assert.equal(classify(answer(200, { errors: [{ code: 999, message: "You cannot delete this" }] })).outcome, "error");
});

test("a 200 without timeline data is not the end of the timeline", () => {
  assert.equal(XApi._hasTimeline({ data: { user: {} } }), true);
  assert.equal(XApi._hasTimeline(null), false);
  assert.equal(XApi._hasTimeline({ errors: [{ message: "x" }] }), false);
});

function respond(status, body) {
  return { status, headers: { get: () => null }, json: async () => body, text: async () => "" };
}

test("when X rotates its query id, the bundle is read again and the delete goes through", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("main.")) {
      bundleReads++;
      return { text: async () => bundle };
    }
    return String(url).includes("/Q2/") ? respond(200, { data: { delete_tweet: {} } }) : respond(404, null);
  };
  await XApi.deletePost("1"); // reads the bundle (Q1), gets a 404, reads it again
  bundle = bundle.replace("Q1", "Q2");
  bundleReads = 0;
  const res = await XApi.deletePost("2");
  assert.equal(res.outcome, "ok");
  assert.equal(bundleReads, 1);
});

test("a dropped connection comes back as a passing failure, not an exception", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("main.")) return { text: async () => bundle };
    throw new TypeError("Failed to fetch");
  };
  const res = await XApi.deletePost("3");
  assert.equal(res.outcome, "transient");
});

test("collect: kinds as X really sends them — own thread replies are posts, replies without 'in reply to' are replies", () => {
  const tw = (id, legacy) => ({
    __typename: "Tweet",
    rest_id: id,
    legacy: { user_id_str: "77", created_at: "Mon Mar 04 12:00:00 +0000 2019", full_text: "x", ...legacy },
  });
  const body = {
    data: {
      entries: [
        tw("1", {}), // a plain post
        tw("2", { in_reply_to_status_id_str: "1", in_reply_to_user_id_str: "77", conversation_id_str: "1" }), // your own thread, listed under Posts
        tw("3", { conversation_id_str: "900", full_text: "@someone hi" }), // a reply whose original is gone: no "in reply to"
        tw("4", { in_reply_to_status_id_str: "900", in_reply_to_user_id_str: "55", conversation_id_str: "900" }), // a reply
        tw("5", { retweeted_status_result: { result: { rest_id: "901", legacy: { full_text: "original" } } } }), // a repost
        { __typename: "Tweet", rest_id: "6", legacy: { user_id_str: "55", created_at: "Mon Mar 04 12:00:00 +0000 2019" } }, // someone else's
      ],
    },
  };
  const kinds = Object.fromEntries(XApi._collect(body, "77").items.map((i) => [i.id, i.kind]));
  assert.deepEqual(kinds, { 1: "post", 2: "post", 3: "reply", 4: "reply", 5: "repost" });
});
