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

  let state = null; // live run state
  let control = { paused: false, stopped: false };

  function storageKey(me) {
    return "xcleaner.progress." + me;
  }

  async function loadProcessed(me) {
    try {
      const k = storageKey(me);
      const got = await chrome.storage.local.get(k);
      return new Set(got[k] || []);
    } catch {
      return new Set();
    }
  }
  async function saveProcessed(me, processed) {
    try {
      await chrome.storage.local.set({ [storageKey(me)]: [...processed] });
    } catch {
      /* storage may be unavailable; the run still works, just without resume */
    }
  }
  async function clearProcessed(me) {
    try {
      await chrome.storage.local.remove(storageKey(me));
    } catch {}
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

  // Deletes one item and folds the result into the counters. Returns the outcome so
  // the caller can react to "limited" (wait) and "auth" (stop).
  async function deleteOne(item, cfg, report) {
    const res = await act(item);
    switch (res.outcome) {
      case "ok":
        state.deleted++;
        state.processed.add(item.id);
        await remember(item);
        break;
      case "gone":
        state.gone++;
        state.processed.add(item.id);
        break;
      case "limited":
        state.waiting = true;
        report();
        await waitForReset(res.rate, report);
        state.waiting = false;
        return "retry";
      case "auth":
        state.fatal = res.message || "session rejected";
        return "auth";
      default:
        state.failures.push({ id: item.id, kind: item.kind, message: res.message || "error" });
        state.processed.add(item.id);
    }
    return res.outcome;
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
    while (control.paused && !control.stopped) {
      state.paused = true;
      report();
      await sleep(500);
    }
    state.paused = false;
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
  // this works for likes too, which have no date of their own. One entry per id.
  function orderItems(items, order) {
    const byId = new Map();
    for (const it of items) if (it && !byId.has(it.id)) byId.set(it.id, it);
    const sign = order === "oldest" ? 1 : -1;
    return [...byId.values()].sort((a, b) => {
      const x = BigInt(a.id);
      const y = BigInt(b.id);
      return x === y ? 0 : x > y ? sign : -sign;
    });
  }

  // A fixed worklist, deleted in order: the archive, or the whole profile read up front.
  async function runList(items, cfg, report) {
    const work = items.filter((it) => matchesFilters(it, cfg) && !state.processed.has(it.id));
    state.total = work.length;
    for (const item of work) {
      if (control.stopped || reachedLimit(cfg)) break;
      let r = await deleteOne(item, cfg, report);
      while (r === "retry" && !control.stopped) r = await deleteOne(item, cfg, report);
      if (r === "auth") break;
      if (state.processed.size % 20 === 0) await saveProcessed(state.me, state.processed);
      report();
      await pace(cfg, report);
    }
  }

  // Archive mode: every item in the archive, in the chosen order.
  async function runArchive(cfg, report) {
    await runList(orderItems(cfg.archiveItems, cfg.order), cfg, report);
  }

  // Timeline mode, oldest first: the profile lists newest first, so read every page of it before
  // deleting anything, then work from the bottom. This reaches only what the profile lists (about
  // the latest 3,200 posts); the archive reaches the rest.
  async function runTimelineOldest(cfg, report) {
    const found = [];
    state.scanning = true;
    state.found = 0;
    report();
    for (const tl of TIMELINES) {
      const kinds = tl.kinds.filter((k) => cfg.types[k]);
      if (!kinds.length) continue;
      const items = await scanTimeline(tl, kinds, found.length, report);
      if (!items) break; // fatal, or stopped
      found.push(...items);
    }
    state.scanning = false;
    if (state.fatal || control.stopped) return;
    await runList(orderItems(found, "oldest"), cfg, report);
  }

  // Reads one profile timeline to the end, keeping the user's own items of the given kinds.
  async function scanTimeline(tl, kinds, base, report) {
    const found = new Map();
    let op = tl.op;
    let cursor = null;
    let emptyPages = 0;
    while (!control.stopped) {
      // Pause holds the reading too, not only the deleting.
      while (control.paused && !control.stopped) {
        state.paused = true;
        report();
        await sleep(500);
      }
      state.paused = false;
      if (control.stopped) break;
      let res;
      try {
        res = await XApi.profilePage(op, cursor);
      } catch (e) {
        if (tl.fallback && op !== tl.fallback) {
          op = tl.fallback;
          cursor = null;
          continue;
        }
        state.fatal = "could not read the timeline (" + (e.message || e) + ")";
        return null;
      }
      if (res.status === 429) {
        await waitForReset(res.rate, report);
        continue;
      }
      if (res.status !== 200) {
        if (tl.fallback && op !== tl.fallback) {
          op = tl.fallback;
          cursor = null;
          continue;
        }
        state.fatal = "the timeline request failed (HTTP " + res.status + ")";
        return null;
      }
      let added = 0;
      for (const it of res.items) {
        if (kinds.includes(it.kind) && !found.has(it.id)) {
          found.set(it.id, it);
          added++;
        }
      }
      state.found = base + found.size;
      report();
      // The end: no next page, or several pages in a row with nothing new.
      if (!res.bottom || res.bottom === cursor) break;
      emptyPages = added ? 0 : emptyPages + 1;
      if (emptyPages >= 5) break;
      cursor = res.bottom;
      await sleep(rand(600, 1200));
    }
    return control.stopped ? null : [...found.values()];
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
        let res;
        try {
          res = await XApi.profilePage(op, cursor);
        } catch (e) {
          if (tl.fallback && op !== tl.fallback) {
            op = tl.fallback;
            cursor = null;
            continue;
          }
          state.fatal = "could not read the timeline (" + (e.message || e) + ")";
          return;
        }
        if (res.status === 429) {
          await waitForReset(res.rate, report);
          continue;
        }
        if (res.status !== 200) {
          if (tl.fallback && op !== tl.fallback) {
            op = tl.fallback;
            cursor = null;
            continue;
          }
          state.fatal = "the timeline request failed (HTTP " + res.status + ")";
          return;
        }
        const mine = res.items.filter((it) => kinds.includes(it.kind));
        const actionable = mine.filter((it) => matchesFilters(it, cfg) && !state.processed.has(it.id));

        if (!actionable.length) {
          // Nothing to delete on this page: go deeper, or finish this timeline.
          if (res.bottom && mine.length) {
            cursor = res.bottom;
            stalls = 0;
          } else if (res.bottom && ++stalls < 5) {
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
          let r = await deleteOne(item, cfg, report);
          while (r === "retry" && !control.stopped) r = await deleteOne(item, cfg, report);
          if (r === "auth") {
            authStop = true;
            break;
          }
          if (state.processed.size % 20 === 0) await saveProcessed(state.me, state.processed);
          report();
          await pace(cfg, report);
        }
        if (authStop) return;
        cursor = null; // the list changed; reload from the top
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
      scanning: state.scanning,
      found: state.found,
    };
  }

  return {
    SPEEDS,
    // Exposed for tests; not used by the rest of the extension.
    _matchesFilters: matchesFilters,
    _orderItems: orderItems,
    isRunning: () => !!(state && state.running),
    pause() {
      control.paused = true;
    },
    resume() {
      control.paused = false;
    },
    stop() {
      control.stopped = true;
    },
    async resetProgress(me) {
      await clearProcessed(me || XApi.userId());
    },

    // Starts a run. `onProgress` receives a snapshot after every meaningful step.
    async start(cfg, onProgress) {
      const me = XApi.userId();
      await XApi.ensureMeta(); // fail fast if the page isn't ready
      control = { paused: false, stopped: false };
      state = {
        me,
        handle: cfg.handle || null,
        source: cfg.source,
        deleted: 0,
        gone: 0,
        failures: [],
        total: cfg.source === "archive" ? 0 : null,
        processed: cfg.resume ? await loadProcessed(me) : new Set(),
        paused: false,
        waiting: false,
        waitUntil: null,
        batchUntil: null,
        lastBatchAt: -1,
        fatal: null,
        running: true,
        historyErrors: 0,
        scanning: false,
        found: 0,
      };
      if (!cfg.resume) await clearProcessed(me);

      const report = () => onProgress && onProgress(snapshot());
      report();
      try {
        if (cfg.source === "archive") await runArchive(cfg, report);
        else if (cfg.order === "oldest") await runTimelineOldest(cfg, report);
        else await runTimeline(cfg, report);
      } catch (e) {
        state.fatal = String(e && e.message ? e.message : e);
      }
      await saveProcessed(me, state.processed);
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
