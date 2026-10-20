// Reads the "Download an archive of your data" file X gives you, so the extension can
// reach every post — including the old ones the profile timeline no longer lists.
//
// Two inputs are accepted:
//   - the whole `.zip`, unpacked here in the browser (no upload, no server);
//   - one or more `tweets*.js` / `like.js` files pulled straight from the archive's
//     `data/` folder, for people who prefer to pick the files themselves.
//
// The archive's data files are `window.YTD.<name>.part0 = [ ... ]` — JavaScript
// assignments, not JSON — so we slice from the first `[` and parse the array.
globalThis.XArchive = (() => {
  function parseDataFile(text) {
    const start = text.indexOf("[");
    if (start < 0) return [];
    const arr = JSON.parse(text.slice(start));
    return arr.map((row) => row.tweet || row.like || row);
  }

  // Normalizes one archive row into the shape the engine uses. Likes carry only an id.
  function normalize(row) {
    if (row.tweetId && !row.id_str) return { id: row.tweetId, kind: "like", createdAt: null };
    const id = row.id_str || row.id;
    if (!id) return null;
    const full = row.full_text || row.text || "";
    const isRepost = full.startsWith("RT @");
    const isReply = !!row.in_reply_to_status_id_str;
    return {
      id,
      createdAt: row.created_at || null,
      kind: isRepost ? "repost" : isReply ? "reply" : "post",
      text: full.slice(0, 80),
    };
  }

  function dedupe(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
    // Newest first, by snowflake id (ids grow over time).
    out.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
    return out;
  }

  // --- Minimal ZIP reader (store + deflate), enough for X's archive -------------
  // X stores each data file either uncompressed or deflated; both are handled with
  // the browser's own DecompressionStream, so there is no third-party unzip code.
  async function readZip(file) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(buf.buffer);
    const eocd = findEOCD(buf, view);
    if (!eocd) throw new Error("not-a-zip");
    const { count, cdOffset } = eocd;

    const files = [];
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break; // central dir header
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
      files.push({ name, method, compSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }

    const wanted = files.filter((f) => /(^|\/)data\/(tweets.*|like)\.js$/.test(f.name));
    const texts = [];
    for (const f of wanted) texts.push(await extract(buf, view, f));
    return texts;
  }

  async function extract(buf, view, f) {
    // Local header: name and extra lengths live here, not in the central directory.
    const lo = f.localOffset;
    if (view.getUint32(lo, true) !== 0x04034b50) throw new Error("bad-local-header");
    const nameLen = view.getUint16(lo + 26, true);
    const extraLen = view.getUint16(lo + 28, true);
    const dataStart = lo + 30 + nameLen + extraLen;
    const raw = buf.subarray(dataStart, dataStart + f.compSize);
    if (f.method === 0) return new TextDecoder().decode(raw);
    if (f.method === 8) return new TextDecoder().decode(await inflateRaw(raw));
    throw new Error("unsupported-zip-method:" + f.method);
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await stream.arrayBuffer());
  }

  function findEOCD(buf, view) {
    // End-of-central-directory record, scanned from the end (it has a variable comment).
    for (let i = buf.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        return { count: view.getUint16(i + 10, true), cdOffset: view.getUint32(i + 16, true) };
      }
    }
    return null;
  }

  return {
    // Reads a FileList the user picked. Accepts the .zip or loose data files, mixed.
    async read(fileList) {
      const files = [...fileList];
      const texts = [];
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) texts.push(...(await readZip(f)));
        else texts.push(await f.text());
      }
      const items = [];
      for (const t of texts) for (const row of parseDataFile(t)) items.push(normalize(row));
      return dedupe(items);
    },
    // Exposed for tests; not part of the public surface the popup uses.
    _internals: { parseDataFile, normalize, dedupe },
  };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XArchive;

