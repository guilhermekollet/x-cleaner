// The deletion engine. It decides what to delete, in what order, and at what pace,
// and it drives XApi one action at a time so the whole run stays well under the
// limits x.com enforces. It reports progress through a callback and saves its
// progress to chrome.storage, so a run that is paused, stopped, or interrupted can
// pick up where it left off. Every item it deletes goes into the history (XHistory) as
// soon as it is gone, so the backup never trails the deletions.
globalThis.XEngine = (() => {
  const SPEEDS = {
    cautious: { minDelay: 2500, maxDelay: 4500, batchSize: 50, batchPause: 90000 },
    normal: { minDelay: 1200, maxDelay: 2600, batchSize: 150, batchPause: 60000 },
    fast: { minDelay: 700, maxDelay: 1400, batchSize: 300, batchPause: 30000 },
  };

  // Which profile timeline carries which kinds, so timeline mode reads each once.
  const TIMELINES = [
    { op: "UserTweets", kinds: ["post", "repost"] },
    { op: "UserRepliesTimeline", fallback: "UserTweetsAndReplies", kinds: ["reply"] },
  ];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  // Progress (the items done) is saved every few items, so a run cut off by a reload repeats at
  // most a handful, which X then reports as already gone.
  const SAVE_EVERY = 5;
  // When X keeps failing — no answer, 5xx, errors on every item, or rate limits that don't lift —
  // the run pauses itself after this many in a row instead of walking through the whole list.
  const TROUBLE_LIMIT = 8;
  const LIMITED_LIMIT = 4;
  // Waits between retries of something that failed for a moment: 5s, 10s, 20s... up to 2 minutes.
  const timing = { backoffBase: 5000 }; // the tests shorten it
  const backoffMs = (tries) => Math.min(120000, timing.backoffBase * 2 ** tries) * rand(0.8, 1.2);
  const READ_RETRIES = 6;

  // An item done is remembered by kind and id: a post you liked yourself shares its id with the
  // like, and deleting one must not count as doing the other.
  const doneKey = (item) => item.kind + ":" + item.id;
  // Progress saved by versions before 0.3.3 holds bare ids; those still count.
  const isDone = (item) => state.processed.has(doneKey(item)) || state.processed.has(item.id);

  // The last few deleted items travel in every snapshot, so the popup can show them going by.
  const RECENT = 4;
  const RECENT_TEXT = 140;

  let state = null; // live run state
  let control = { paused: false, stopped: false };

  // --- Progress: the items done, per account ------------------------------------------------
  // Kept in chunks that only grow at the end, so a save writes the newest chunk, not the whole
  // list (a long run reaches 100,000 items):
  //   xcleaner.done.<me>      { chunks }
  //   xcleaner.done.<me>.<i>  up to PROGRESS_CHUNK keys ("kind:id"), in the order they were done
  // Versions before 0.3.3 kept one array of bare ids under xcleaner.progress.<me>; it is read and
  // moved over on the next save.
  const PROGRESS_CHUNK = 1000;
  const legacyKey = (me) => "xcleaner.progress." + me;
  const doneKeyOf = (me) => "xcleaner.done." + me;
  const doneChunkKey = (me, i) => "xcleaner.done." + me + "." + i;

  // Returns { keys: the items done, in order, chunks: how many chunks are stored, legacy }.
  async function loadProgress(me, store = chrome.storage.local) {
    try {
      const got = await store.get([doneKeyOf(me), legacyKey(me)]);
      const chunks = got[doneKeyOf(me)]?.chunks || 0;
      const keys = [];
      if (chunks) {
        const names = Array.from({ length: chunks }, (_, i) => doneChunkKey(me, i));
        const parts = await store.get(names);
        for (const n of names) keys.push(...(parts[n] || []));
      }
      const legacy = got[legacyKey(me)] || null;
      if (legacy) {
        const seen = new Set(keys);
        for (const k of legacy) if (!seen.has(k)) keys.push(k);
      }
      return { keys, chunks, legacy: !!legacy };
    } catch {
      return { keys: [], chunks: 0, legacy: false };
    }
  }

  // Writes what changed since the last save: from the first chunk with a removal (`dirtyFrom`),
  // or from the chunk holding the first unsaved key; everything when moving old progress over.
  async function saveProgress(me, p, store = chrome.storage.local) {
    const chunks = Math.ceil(p.keys.length / PROGRESS_CHUNK);
    const from = p.legacy ? 0 : Math.min(p.dirtyFrom ?? Infinity, Math.floor(p.savedLen / PROGRESS_CHUNK));
    if (from >= chunks && chunks === p.chunks) return;
    const writes = { [doneKeyOf(me)]: { chunks } };
    for (let i = from; i < chunks; i++) writes[doneChunkKey(me, i)] = p.keys.slice(i * PROGRESS_CHUNK, (i + 1) * PROGRESS_CHUNK);
    const drop = [];
    for (let i = chunks; i < p.chunks; i++) drop.push(doneChunkKey(me, i));
    if (p.legacy) drop.push(legacyKey(me));
    try {
      await store.set(writes);
      if (drop.length) await store.remove(drop);
      Object.assign(p, { savedLen: p.keys.length, chunks, dirtyFrom: null, legacy: false });
    } catch {
      /* storage may be unavailable; the run still works, just without resume */
    }
  }

  async function clearProgress(me, store = chrome.storage.local) {
    try {
      const chunks = (await store.get(doneKeyOf(me)))[doneKeyOf(me)]?.chunks || 0;
      const keys = [doneKeyOf(me), legacyKey(me)];
      for (let i = 0; i < chunks; i++) keys.push(doneChunkKey(me, i));
      await store.remove(keys);
    } catch {}
  }

  // The run's view of its progress: a set to look items up, and the ordered list that is saved.
  function markDone(key) {
    if (state.processed.has(key)) return;
    state.processed.add(key);
    state.progress.keys.push(key);
  }
  function unmarkDone(keys) {
    const drop = new Set(keys);
    const p = state.progress;
    const first = p.keys.findIndex((k) => drop.has(k));
    if (first < 0) return;
    for (const k of keys) state.processed.delete(k);
    p.keys = p.keys.filter((k) => !drop.has(k));
    p.savedLen = Math.min(p.savedLen, first);
    p.dirtyFrom = Math.min(p.dirtyFrom ?? Infinity, Math.floor(first / PROGRESS_CHUNK));
  }
  // What the profile still lists hasn't been deleted, whatever an earlier run concluded about it
  // (an error, or X answering "not found"): its "done" mark is dropped so it is tried again. Each
  // item is still tried at most once per run (state.tried), so nothing loops.
  function stillListed(items) {
    const keys = [];
    for (const it of items) {
      if (state.tried.has(doneKey(it)) || !isDone(it)) continue;
      keys.push(doneKey(it), it.id); // the id too: progress from before 0.3.3 holds bare ids
    }
    if (keys.length) unmarkDone(keys);
  }
  // Counts what the profile showed of the chosen kinds, so a run that found nothing can say so.
  function sawListed(items) {
    for (const it of items) state.seen.add(doneKey(it));
  }

  async function saveIfDue() {
    if (state.progress.keys.length - state.progress.savedLen >= SAVE_EVERY) await saveProgress(state.me, state.progress);
  }

  function matchesFilters(item, cfg) {
    if (!cfg.types[item.kind]) return false;
    if (cfg.keepIds.has(item.id)) return false;
    if (cfg.keyword && !(item.text || "").toLowerCase().includes(cfg.keyword.toLowerCase())) return false;
    if (cfg.since || cfg.until) {
      const d = item.createdAt ? new Date(item.createdAt) : null;
      if (d) {
        if (cfg.since && d < cfg.since) return false;
        if (cfg.until && d >= cfg.until) return false;
      } else if (cfg.since || cfg.until) {
        return false; // a date filter is set but this item has no date (archive like)
      }
    }
    return true;
  }

  // Posts, replies and reposts all go through DeleteTweet with their own id; likes are undone.
  function act(item) {
    if (item.kind === "like") return XApi.removeLike(item.id);
    return XApi.deletePost(item.id);
  }

  // Deletes one item and folds the result into the counters. Returns the outcome so the caller
  // can react: "retry" (try the same item again), "auth" (stop), or what happened to it.
  async function deleteOne(item, cfg, report) {
    state.tried.add(doneKey(item));
    let res;
    try {
      res = await act(item);
    } catch (e) {
      // Not reaching x.com at all, or the page's API gone: nothing happened to the item.
      res = { outcome: /operation-missing|bundle-not-found|not-signed-in/.test(e?.message) ? "auth" : "transient", message: String(e?.message || e) };
    }
    switch (res.outcome) {
      case "ok":
      case "gone":
        if (res.outcome === "ok") state.deleted++;
        else state.gone++;
        markDone(doneKey(item));
        state.trouble = 0;
        state.troubleKeys = [];
        state.limitedInRow = 0;
        if (res.outcome === "ok") {
          // The popup's live list of what was just deleted (newest first, a few lines each).
          state.recent = [
            {
              id: item.id,
              kind: item.kind,
              text: (item.text || "").slice(0, RECENT_TEXT),
              createdAt: item.createdAt || null,
              replyTo: item.replyTo?.user || null,
            },
            ...state.recent,
          ].slice(0, RECENT);
          await remember(item);
        }
        return res.outcome;
      case "limited":
        if (++state.limitedInRow >= LIMITED_LIMIT) return stall("limited", report);
        state.waiting = true;
        report();
        await waitForReset(res.rate, report);
        state.waiting = false;
        return "retry";
      case "auth":
        state.fatal = res.message || "session rejected";
        return "auth";
      case "transient":
        if (++state.trouble >= TROUBLE_LIMIT) return stall("errors", report);
        await waitBackoff(state.trouble - 1, report);
        return "retry";
      default:
        state.failures.push({ id: item.id, kind: item.kind, message: res.message || "error" });
        markDone(doneKey(item));
        state.troubleKeys.push(doneKey(item));
        if (++state.trouble >= TROUBLE_LIMIT) {
          // Failing on every item in a row is X, not the items: give them another chance later.
          unmarkDone(state.troubleKeys);
          state.troubleKeys = [];
          return stall("errors", report);
        }
        return "error";
    }
  }

  // Pauses the run on its own, with the reason for the popup ("errors": X isn't answering or
  // fails on everything; "limited": X keeps refusing). Resume clears it and tries again.
  function stall(reason, report) {
    state.stalled = reason;
    state.trouble = 0;
    state.limitedInRow = 0;
    control.paused = true;
    report();
    return "retry";
  }

  // Holds while the run is paused (by the user, or stalled on its own).
  async function holdWhilePaused(report) {
    while (control.paused && !control.stopped) {
      state.paused = true;
      report();
      await sleep(500);
    }
    state.paused = false;
    state.stalled = null;
  }

  // Deletes one item, retrying it through passing failures and rate limits, and honoring pause
  // and stop before every attempt.
  async function attempt(item, cfg, report) {
    for (;;) {
      await holdWhilePaused(report);
      if (control.stopped) return "stopped";
      const r = await deleteOne(item, cfg, report);
      if (r !== "retry") return r;
    }
  }

  async function waitBackoff(tries, report) {
    const until = Date.now() + backoffMs(tries);
    while (Date.now() < until && !control.stopped) {
      state.retryUntil = until;
      report();
      await sleep(Math.min(3000, until - Date.now()));
    }
    state.retryUntil = null;
  }

  // Adds a deleted item to the history. A storage failure must not stop the run: the post is
  // already gone, so it is counted and the run goes on.
  async function remember(item) {
    try {
      await XHistory.append(state.me, [XHistory.fromItem(item, { source: state.source })], { handle: state.handle });
    } catch {
      state.historyErrors++;
    }
  }

  async function waitForReset(rate, report) {
    const ms = rate?.reset ? Math.max(60000, rate.reset * 1000 - Date.now() + 5000) : 15 * 60000;
    const until = Date.now() + ms;
    while (Date.now() < until && !control.stopped) {
      state.waitUntil = until;
      report();
      await sleep(Math.min(5000, until - Date.now()));
    }
    state.waitUntil = null;
  }

  // Honors pause/stop between actions and runs the batch pause when a batch fills up.
  async function pace(cfg, report) {
    await holdWhilePaused(report);
    if (control.stopped) return;
    const acted = state.deleted + state.gone;
    if (acted > 0 && acted % cfg.speed.batchSize === 0 && acted !== state.lastBatchAt) {
      state.lastBatchAt = acted;
      const until = Date.now() + cfg.speed.batchPause;
      while (Date.now() < until && !control.stopped && !control.paused) {
        state.batchUntil = until;
        report();
        await sleep(Math.min(3000, until - Date.now()));
      }
      state.batchUntil = null;
    }
    await sleep(rand(cfg.speed.minDelay, cfg.speed.maxDelay));
  }

  function reachedLimit(cfg) {
    return state.deleted + state.gone >= cfg.limit;
  }

  // Newest first (the default) or oldest first, by id: ids are snowflakes that grow over time, so
  // this works for likes too, which have no date of their own. One entry per kind and id.
  function orderItems(items, order) {
    const byId = new Map();
    for (const it of items) if (it && !byId.has(doneKey(it))) byId.set(doneKey(it), it);
    const sign = order === "oldest" ? 1 : -1;
    return [...byId.values()].sort((a, b) => {
      const x = BigInt(a.id);
      const y = BigInt(b.id);
      return x === y ? 0 : x > y ? sign : -sign;
    });
  }

  // A fixed worklist, deleted in order: the archive, or the whole profile read up front.
  async function runList(items, cfg, report) {
    const work = items.filter((it) => matchesFilters(it, cfg) && !isDone(it));
    state.total = work.length;
    for (const item of work) {
      if (control.stopped || reachedLimit(cfg)) break;
      const r = await attempt(item, cfg, report);
      if (r === "auth" || r === "stopped") break;
      await saveIfDue();
      report();
      await pace(cfg, report);
    }
  }

  // Archive mode: every item in the archive, in the chosen order.
  async function runArchive(cfg, report) {
    await runList(orderItems(cfg.archiveItems, cfg.order), cfg, report);
  }

  // --- Timeline mode, oldest first --------------------------------------------------------
  // The profile lists newest first, so finding the oldest means reading all of it before deleting
  // anything. X serves about 20 posts a page and limits how many pages it serves per 15 minutes,
  // so on a large profile that read takes a while and may wait for X. What has been read is kept
  // per account for a day: a stopped read picks up where it left off, and later batches start
  // deleting at once. Deleted items are pruned from it as runs go. This reaches only what the
  // profile lists (about the latest 3,200 posts); the archive reaches the rest.
  const SCAN_TTL = 24 * 60 * 60 * 1000;
  const scanKey = (me) => "xcleaner.scan." + me;
  const scanMetaKey = (me) => "xcleaner.scanmeta." + me;
  const freshScan = () => ({ v: 1, at: Date.now(), postCount: null, timelines: {}, items: [] });

  async function loadScan(me) {
    try {
      const scan = (await chrome.storage.local.get(scanKey(me)))[scanKey(me)];
      if (scan && scan.v === 1 && Date.now() - scan.at < SCAN_TTL) return scan;
    } catch {}
    return freshScan();
  }
  // The read, and a small summary of it the popup reads to say whether a run starts at once.
  async function saveScan(me, scan) {
    const done = Object.keys(scan.timelines).filter((k) => scan.timelines[k].done);
    try {
      await chrome.storage.local.set({
        [scanKey(me)]: scan,
        [scanMetaKey(me)]: { at: scan.at, done, count: scan.items.length, postCount: scan.postCount },
      });
    } catch {
      /* without storage the read is simply not kept */
    }
  }

  async function runTimelineOldest(cfg, report) {
    const needed = TIMELINES.filter((tl) => tl.kinds.some((k) => cfg.types[k]));
    let scan = await loadScan(state.me);
    const ready = () => needed.every((tl) => scan.timelines[tl.op]?.done);
    // A finished read with nothing left of the chosen kinds is read again, for newer posts.
    if (ready() && !scan.items.some((it) => cfg.types[it.kind] && !isDone(it))) scan = freshScan();
    const readNow = !ready();
    if (!ready()) {
      state.scanning = true;
      state.found = scan.items.length;
      state.scanTotal = scan.postCount;
      report();
      for (const tl of needed) {
        if (scan.timelines[tl.op]?.done) continue;
        const finished = await scanTimeline(tl, scan, report);
        await saveScan(state.me, scan);
        if (!finished) return; // stopped or failed: what was read is kept for next time
      }
      state.scanning = false;
    }
    const listed = scan.items.filter((it) => matchesFilters(it, cfg));
    sawListed(listed);
    if (readNow) stillListed(listed);
    try {
      await runList(orderItems(scan.items, "oldest"), cfg, report);
    } finally {
      scan.items = scan.items.filter((it) => !isDone(it));
      await saveScan(state.me, scan);
    }
  }

  // Reads one profile timeline to its end, from where an earlier read stopped, adding the user's
  // own items of that timeline's kinds to the scan. Returns false if stopped or failed.
  async function scanTimeline(tl, scan, report) {
    const pos = scan.timelines[tl.op] || (scan.timelines[tl.op] = { op: tl.op, cursor: null, done: false });
    const known = new Set(scan.items.map((it) => it.id));
    let emptyPages = 0;
    let pages = 0;
    let restarted = false;
    // After reading again from the top, the first pages are all known: they don't mean the end
    // until something new turns up.
    let counting = true;
    while (!control.stopped) {
      const res = await readPage(pos.op, pos.cursor, report);
      if (!res) return false; // stopped
      if (res.status !== 200) {
        // A saved cursor may have expired: read again from the top once (what is known is kept).
        if (pos.cursor && !restarted && !res.transient) {
          restarted = true;
          counting = false;
          pos.cursor = null;
          continue;
        }
        if (tl.fallback && pos.op !== tl.fallback && !res.transient) {
          pos.op = tl.fallback;
          pos.cursor = null;
          counting = false;
          continue;
        }
        state.fatal = readFailure(res);
        return false;
      }
      if (res.postCount) scan.postCount = state.scanTotal = res.postCount;
      let added = 0;
      for (const it of res.items) {
        if (tl.kinds.includes(it.kind) && !known.has(it.id)) {
          known.add(it.id);
          scan.items.push(it);
          added++;
        }
      }
      state.found = scan.items.length;
      report();
      // The end: no next page, or several pages in a row with nothing new.
      if (added) counting = true;
      emptyPages = added ? 0 : counting ? emptyPages + 1 : 0;
      if (!res.bottom || res.bottom === pos.cursor || emptyPages >= 5) {
        pos.done = true;
        return true;
      }
      pos.cursor = res.bottom;
      if (++pages % 5 === 0) await saveScan(state.me, scan);
      await sleep(rand(600, 1200));
    }
    return false;
  }

  // Reads one page of a profile timeline: waits out rate limits, and retries passing failures (no
  // answer, a 5xx, a 200 without data) on the same cursor with a growing wait. Returns the page,
  // a failed result for the caller to handle, or null when stopped.
  async function readPage(op, cursor, report) {
    for (let tries = 0; ; ) {
      await holdWhilePaused(report);
      if (control.stopped) return null;
      let res;
      try {
        res = await XApi.profilePage(op, cursor);
      } catch (e) {
        const message = String(e?.message || e);
        res = { status: 0, error: message, transient: !/operation-missing|bundle-not-found|not-signed-in/.test(message), items: [] };
      }
      if (res.status === 429) {
        state.waiting = true;
        await waitForReset(res.rate, report);
        state.waiting = false;
        continue;
      }
      if (res.status === 200 && !res.transient) return res;
      if (res.transient && tries < READ_RETRIES) {
        await waitBackoff(tries++, report);
        continue;
      }
      return res;
    }
  }

  function readFailure(res) {
    return res.error
      ? "could not read the timeline (" + res.error + ")"
      : "the timeline request failed (HTTP " + res.status + ")";
  }

  // Timeline mode: drains each profile timeline from the top. Deleting changes the
  // list, so after any deletion we reload from the top; when a page has nothing to
  // delete we page deeper with its cursor.
  async function runTimeline(cfg, report) {
    for (const tl of TIMELINES) {
      const kinds = tl.kinds.filter((k) => cfg.types[k]);
      if (!kinds.length) continue;
      let op = tl.op;
      let cursor = null;
      let stalls = 0;
      while (!control.stopped && !reachedLimit(cfg)) {
        const res = await readPage(op, cursor, report);
        if (!res) return; // stopped
        if (res.status !== 200) {
          if (tl.fallback && op !== tl.fallback && !res.transient) {
            op = tl.fallback;
            cursor = null;
            continue;
          }
          state.fatal = readFailure(res);
          return;
        }
        const mine = res.items.filter((it) => kinds.includes(it.kind));
        const listed = mine.filter((it) => matchesFilters(it, cfg));
        sawListed(listed);
        stillListed(listed);
        const actionable = listed.filter((it) => !isDone(it) && !state.tried.has(doneKey(it)));

        if (!actionable.length) {
          // Nothing to delete on this page: go deeper, or finish this timeline.
          if (!res.bottom || res.bottom === cursor) break;
          if (mine.length) {
            cursor = res.bottom;
            stalls = 0;
          } else if (++stalls < 5) {
            cursor = res.bottom;
          } else {
            break;
          }
          await sleep(rand(600, 1200));
          continue;
        }

        stalls = 0;
        let authStop = false;
        for (const item of actionable) {
          if (control.stopped || reachedLimit(cfg)) break;
          const r = await attempt(item, cfg, report);
          if (r === "stopped") break;
          if (r === "auth") {
            authStop = true;
            break;
          }
          await saveIfDue();
          report();
          await pace(cfg, report);
        }
        if (authStop) return;
        // The page changed: read it again from the same cursor. The pages above it had nothing
        // to delete, so going back to the top would only read them again.
      }
    }
  }

  function snapshot() {
    return {
      source: state.source,
      deleted: state.deleted,
      gone: state.gone,
      failures: state.failures.length,
      failureList: state.failures.slice(0, 50),
      total: state.total,
      processed: state.processed.size,
      paused: state.paused,
      waiting: state.waiting,
      waitUntil: state.waitUntil,
      batchUntil: state.batchUntil,
      fatal: state.fatal,
      running: state.running,
      historyErrors: state.historyErrors,
      stalled: state.stalled,
      retryUntil: state.retryUntil,
      scanning: state.scanning,
      found: state.found,
      scanTotal: state.scanTotal,
      // Timeline mode: how many of the user's items the profile showed. Zero means it listed none.
      seen: state.source === "archive" ? null : state.seen.size,
      recent: state.recent,
      // The batch: its size (null for everything at once), its order, and whether it is the test.
      limit: Number.isFinite(state.limit) ? state.limit : null,
      order: state.order,
      test: state.test,
    };
  }

  return {
    SPEEDS,
    // Exposed for tests; not used by the rest of the extension.
    _matchesFilters: matchesFilters,
    _orderItems: orderItems,
    _doneKey: doneKey,
    _loadProgress: loadProgress,
    _saveProgress: saveProgress,
    _clearProgress: clearProgress,
    _backoffMs: backoffMs,
    _timing: timing,
    isRunning: () => !!(state && state.running),
    pause() {
      control.paused = true;
    },
    resume() {
      control.paused = false;
      if (state) state.stalled = null;
    },
    stop() {
      control.stopped = true;
    },
    async resetProgress(me) {
      await clearProgress(me || XApi.userId());
    },

    // Starts a run. `onProgress` receives a snapshot after every meaningful step.
    // Marks itself running before its first await, so a second start (a double click) is refused;
    // and anything that goes wrong, even before the first deletion, ends in a final snapshot with
    // the reason, never in a run that seems to work forever.
    async start(cfg, onProgress) {
      if (state && state.running) throw new Error("already-running");
      control = { paused: false, stopped: false };
      state = {
        me: null,
        handle: cfg.handle || null,
        source: cfg.source,
        limit: cfg.limit,
        order: cfg.order === "oldest" ? "oldest" : "newest",
        test: !!cfg.test,
        deleted: 0,
        gone: 0,
        failures: [],
        total: cfg.source === "archive" ? 0 : null,
        processed: new Set(),
        progress: { keys: [], savedLen: 0, chunks: 0, dirtyFrom: null, legacy: false },
        paused: false,
        waiting: false,
        waitUntil: null,
        batchUntil: null,
        lastBatchAt: -1,
        fatal: null,
        running: true,
        historyErrors: 0,
        recent: [],
        trouble: 0, // passing failures and item errors in a row
        troubleKeys: [], // the items failed in that streak
        limitedInRow: 0,
        stalled: null,
        retryUntil: null,
        scanning: false,
        found: 0,
        scanTotal: null,
        tried: new Set(), // every item attempted in this run
        seen: new Set(), // the user's items of the chosen kinds the profile listed (timeline mode)
      };
      const report = () => onProgress && onProgress(snapshot());
      try {
        state.me = XApi.userId();
        await XApi.ensureMeta(); // fail fast if the page isn't ready
        if (cfg.resume) {
          const p = await loadProgress(state.me);
          state.progress = { keys: p.keys, savedLen: p.keys.length, chunks: p.chunks, dirtyFrom: null, legacy: p.legacy };
          state.processed = new Set(p.keys);
        } else await clearProgress(state.me);
        report();
        if (cfg.source === "archive") await runArchive(cfg, report);
        else if (cfg.order === "oldest") await runTimelineOldest(cfg, report);
        else await runTimeline(cfg, report);
      } catch (e) {
        state.fatal = String(e && e.message ? e.message : e);
      }
      if (state.me) await saveProgress(state.me, state.progress);
      state.running = false;
      const final = snapshot();
      final.stopped = control.stopped;
      // A batch that filled up: there is probably more, so the popup offers the next batch.
      final.limitReached = Number.isFinite(cfg.limit) && reachedLimit(cfg);
      final.test = !!cfg.test;
      report();
      return final;
    },
  };
})();

// Allow the pure helpers to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XEngine;
