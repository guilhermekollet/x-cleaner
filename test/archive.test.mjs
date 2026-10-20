// Tests for the archive reader: the hand-written ZIP extraction (store + deflate)
// and the tweets.js parsing. These are the most fragile, novel pieces, so they get
// the most coverage. Run with `node --test` (see scripts/test.sh).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XArchive = require("../src/archive.js");
const { parseDataFile, normalize, dedupe } = XArchive._internals;

function tweetsJs(rows) {
  return "window.YTD.tweets.part0 = " + JSON.stringify(rows.map((tweet) => ({ tweet })));
}

test("parseDataFile reads the window.YTD assignment, not JSON", () => {
  const text = tweetsJs([{ id_str: "1", created_at: "x", full_text: "hi" }]);
  const rows = parseDataFile(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id_str, "1");
});

test("normalize classifies posts, replies and reposts", () => {
  assert.equal(normalize({ id_str: "1", full_text: "hello" }).kind, "post");
  assert.equal(normalize({ id_str: "2", full_text: "hi", in_reply_to_status_id_str: "9" }).kind, "reply");
  assert.equal(normalize({ id_str: "3", full_text: "RT @x: hi" }).kind, "repost");
  assert.equal(normalize({ tweetId: "4" }).kind, "like");
});

test("dedupe removes repeats and sorts newest first", () => {
  const out = dedupe([
    { id: "100", kind: "post" },
    { id: "200", kind: "post" },
    { id: "100", kind: "post" },
  ]);
  assert.deepEqual(out.map((x) => x.id), ["200", "100"]);
});

// Builds a minimal but valid ZIP in memory with two entries: one stored, one
// deflated, so the reader's two code paths are both exercised.
function buildZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

  for (const e of entries) {
    const name = Buffer.from(enc.encode(e.name));
    const raw = Buffer.from(enc.encode(e.text));
    const data = e.method === 8 ? deflateRawSync(raw) : raw;
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0), u16(e.method), u16(0), u16(0),
      u32(0), u32(data.length), u32(raw.length), u16(name.length), u16(0), name, data,
    ]);
    chunks.push(local);
    central.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(e.method), u16(0), u16(0),
      u32(0), u32(data.length), u32(raw.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...chunks, cd, eocd]);
}

test("read() extracts stored and deflated data files from a .zip", async () => {
  const stored = tweetsJs([{ id_str: "1000", full_text: "stored post", created_at: "a" }]);
  const packed = tweetsJs([{ id_str: "2000", full_text: "RT @y: z", created_at: "b" }]);
  const zip = buildZip([
    { name: "data/tweets.js", method: 0, text: stored },
    { name: "data/tweets-part1.js", method: 8, text: packed },
    { name: "data/account.js", method: 0, text: "window.YTD.account.part0 = []" },
  ]);
  const file = new File([zip], "archive.zip");
  const items = await XArchive.read([file]);
  assert.equal(items.length, 2);
  // Newest id first.
  assert.deepEqual(items.map((i) => i.id), ["2000", "1000"]);
  assert.equal(items.find((i) => i.id === "2000").kind, "repost");
});

test("read() accepts loose tweets.js files too", async () => {
  const text = tweetsJs([{ id_str: "5", full_text: "hi", created_at: "c" }]);
  const items = await XArchive.read([new File([text], "tweets.js")]);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "5");
});
