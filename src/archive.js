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

  // Normalizes one archive row into the shape the engine uses. The full text, media and links
  // ride along so the history keeps them once the item is deleted. Likes carry the liked post's
  // id, and usually its text and link, but no date.
  function normalize(row) {
    if (row.tweetId && !row.id_str) {
      return { id: row.tweetId, kind: "like", createdAt: null, text: row.fullText || "", url: row.expandedUrl || null };
    }
    const id = row.id_str || row.id;
    if (!id) return null;
    const { text, media, links, replyTo } = XHistory.details(row);
    const isRepost = text.startsWith("RT @");
    return {
      id,
      createdAt: row.created_at || null,
      kind: isRepost ? "repost" : replyTo ? "reply" : "post",
      text,
      media,
      links,
      replyTo,
    };
  }

  // One entry per kind and id: a post you liked yourself shares its id with the like, and both
  // must stay (deleting the post and removing the like are two different things).
  function dedupe(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      if (!it || seen.has(it.kind + ":" + it.id)) continue;
      seen.add(it.kind + ":" + it.id);
      out.push(it);
    }
    // Newest first, by snowflake id (ids grow over time).
    out.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1));
    return out;
  }

  // --- Minimal ZIP reader (store + deflate, zip64), enough for X's archive ---------------
  // X stores each data file either uncompressed or deflated; both are handled with the browser's
  // own DecompressionStream, so there is no third-party unzip code. The archive can be several GB
  // (it holds your media) with more than 65,535 files, so it is never loaded whole: only its end,
  // its central directory and the data files wanted are read, with File.slice; and the zip64
  // records large archives use are understood.
  const WANTED = /(^|\/)data\/(tweets.*|like.*)\.js$/;

  const bytesOf = async (file, start, end) => new Uint8Array(await file.slice(start, end).arrayBuffer());
  const viewOf = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u64 = (view, at) => view.getUint32(at, true) + view.getUint32(at + 4, true) * 2 ** 32;

  async function readZip(file) {
    const dir = await centralDirectory(file);
    const entries = parseCentralDirectory(dir.bytes, dir.count);
    const wanted = entries.filter((f) => WANTED.test(f.name));
    if (!wanted.length) throw new Error("no-tweets-in-zip");
    const texts = [];
    for (const f of wanted) texts.push(await extract(file, f));
    return texts;
  }

  // Finds the end-of-central-directory record (scanning back over a comment of up to 64 KB), and
  // the zip64 one when the classic fields are maxed out.
  async function centralDirectory(file) {
    const tailStart = Math.max(0, file.size - (22 + 65535 + 20));
    const tail = await bytesOf(file, tailStart, file.size);
    const view = viewOf(tail);
    let at = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        at = i;
        break;
      }
    }
    if (at < 0) throw new Error("not-a-zip");
    let count = view.getUint16(at + 10, true);
    let size = view.getUint32(at + 12, true);
    let offset = view.getUint32(at + 16, true);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
      // Zip64: a locator just before the record points at the zip64 end-of-central-directory.
      const loc = at - 20;
      if (loc < 0 || view.getUint32(loc, true) !== 0x07064b50) throw new Error("bad-zip64");
      const recAt = u64(view, loc + 8);
      const rec = viewOf(await bytesOf(file, recAt, recAt + 56));
      if (rec.getUint32(0, true) !== 0x06064b50) throw new Error("bad-zip64");
      count = u64(rec, 32);
      size = u64(rec, 40);
      offset = u64(rec, 48);
    }
    return { count, bytes: await bytesOf(file, offset, offset + size) };
  }

  function parseCentralDirectory(bytes, count) {
    const view = viewOf(bytes);
    const decoder = new TextDecoder();
    const files = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
      if (view.getUint32(p, true) !== 0x02014b50) break; // central dir header
      const method = view.getUint16(p + 10, true);
      let compSize = view.getUint32(p + 20, true);
      let size = view.getUint32(p + 24, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      let localOffset = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      // Zip64 extra field (0x0001): the 64-bit values for the fields maxed out above, in order.
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = view.getUint16(e, true);
        const len = view.getUint16(e + 2, true);
        if (id === 0x0001) {
          let q = e + 4;
          if (size === 0xffffffff) (size = u64(view, q)), (q += 8);
          if (compSize === 0xffffffff) (compSize = u64(view, q)), (q += 8);
          if (localOffset === 0xffffffff) localOffset = u64(view, q);
        }
        e += 4 + len;
      }
      files.push({ name, method, compSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  async function extract(file, f) {
    // Local header: name and extra lengths live here, not in the central directory.
    const head = viewOf(await bytesOf(file, f.localOffset, f.localOffset + 30));
    if (head.getUint32(0, true) !== 0x04034b50) throw new Error("bad-local-header");
    const dataStart = f.localOffset + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    const raw = await bytesOf(file, dataStart, dataStart + f.compSize);
    if (f.method === 0) return new TextDecoder().decode(raw);
    if (f.method === 8) return new TextDecoder().decode(await inflateRaw(raw));
    throw new Error("unsupported-zip-method:" + f.method);
  }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await stream.arrayBuffer());
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
    _internals: { parseDataFile, normalize, dedupe, parseCentralDirectory },
  };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XArchive;

