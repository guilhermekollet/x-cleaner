// A thin client for the GraphQL endpoints x.com's own web app uses. It reads the
// query IDs and the feature flags from the page that is already loaded, so it
// follows the live site instead of hard-coding values that the site keeps changing.
//
// Everything here runs in the content script's isolated world, on an x.com tab the
// user is already signed in to. It talks only to x.com, with the browser's own
// cookies, and never sends anything anywhere else.
globalThis.XApi = (() => {
  // The public bearer token the web client ships to everyone. It is not a secret and
  // not tied to an account; the session comes from the cookies the browser sends.
  const BEARER =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  const api = `${location.origin}/i/api/graphql`;
  let meta = null; // cached { operations, featureValues }

  function cookie(name) {
    return document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"))?.[1] ?? null;
  }

  function headers() {
    const ct0 = cookie("ct0");
    if (!ct0) throw new Error("not-signed-in");
    return {
      authorization: "Bearer " + BEARER,
      "content-type": "application/json",
      "x-csrf-token": ct0,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes",
      "x-twitter-client-language": "en",
    };
  }

  // The signed-in account's numeric id, from the twid cookie (u%3D<id>).
  function userId() {
    const twid = cookie("twid");
    const m = twid && decodeURIComponent(twid).match(/u=(\d+)/);
    if (!m) throw new Error("not-signed-in");
    return m[1];
  }

  // Reads the feature-flag defaults the page booted with. The timeline queries reject
  // the request unless every feature they declare is present, so we echo these back.
  function readFeatureValues() {
    const values = {};
    for (const s of document.querySelectorAll("script:not([src])")) {
      const t = s.textContent;
      if (!t || !t.includes('"featureSwitch"')) continue;
      for (const m of t.matchAll(/"([a-z0-9_]+)":\{"value":(true|false)\}/g)) {
        values[m[1]] = m[2] === "true";
      }
    }
    return values;
  }

  // Parses the web client's main bundle for each operation's query id and the exact
  // list of features and field toggles it expects.
  async function readOperations() {
    const src = [...document.querySelectorAll("script[src]")]
      .map((s) => s.src)
      .find((u) => /\/main\.[0-9a-f]+\.js/.test(u));
    if (!src) throw new Error("bundle-not-found");
    const js = await (await fetch(src)).text();

    const wanted = [
      "UserTweets",
      "UserTweetsAndReplies",
      "UserRepliesTimeline",
      "UserMedia",
      "Likes",
      "DeleteTweet",
      "UnfavoriteTweet",
    ];
    const ops = {};
    for (const name of wanted) {
      const re = new RegExp(
        'queryId:"([^"]+)",operationName:"' +
          name +
          '",operationType:"\\w+",metadata:\\{featureSwitches:\\[([^\\]]*)\\],fieldToggles:\\[([^\\]]*)\\]'
      );
      const m = js.match(re);
      if (!m) continue;
      const list = (s) => (s ? s.split(",").map((x) => x.replace(/"/g, "")).filter(Boolean) : []);
      ops[name] = { queryId: m[1], features: list(m[2]), toggles: list(m[3]) };
    }
    return ops;
  }

  async function ensureMeta() {
    if (meta) return meta;
    meta = { operations: await readOperations(), featureValues: readFeatureValues() };
    return meta;
  }

  // Builds the features object a query needs, from the page defaults. Anything the
  // page didn't define defaults to false, which the server accepts.
  function featuresFor(op, featureValues) {
    const out = {};
    for (const f of op.features) out[f] = featureValues[f] ?? false;
    return out;
  }
  function togglesFor(op) {
    const out = {};
    for (const t of op.toggles) out[t] = false;
    return out;
  }

  function parseRate(r, body) {
    return {
      status: r.status,
      body,
      rate: {
        remaining: Number(r.headers.get("x-rate-limit-remaining")),
        reset: Number(r.headers.get("x-rate-limit-reset")),
      },
    };
  }

  // Sends one request for an operation. x.com rotates query ids now and then: an operation that
  // has gone missing from the cached bundle, or a 404, makes it read the page's bundle again and
  // retry once. A request that never reaches x.com (offline, a dropped connection) comes back as
  // status 0 instead of throwing, so the engine can wait and retry it.
  async function withOperation(opName, send) {
    for (let fresh = false; ; fresh = true) {
      const { operations, featureValues } = await ensureMeta();
      const op = operations[opName];
      if (!op) {
        if (fresh) throw new Error("operation-missing:" + opName);
        meta = null;
        continue;
      }
      let res;
      try {
        const r = await send(op, featureValues);
        res = parseRate(r, await r.json().catch(() => null));
      } catch (e) {
        res = { status: 0, body: null, rate: {}, error: String(e && e.message ? e.message : e) };
      }
      if (res.status === 404 && !fresh) {
        meta = null;
        continue;
      }
      return res;
    }
  }

  function timelinePage(opName, variables) {
    return withOperation(opName, (op, featureValues) => {
      const u = new URL(`${api}/${op.queryId}/${opName}`);
      u.searchParams.set("variables", JSON.stringify(variables));
      u.searchParams.set("features", JSON.stringify(featuresFor(op, featureValues)));
      u.searchParams.set("fieldToggles", JSON.stringify(togglesFor(op)));
      return fetch(u.toString(), { credentials: "include", headers: headers() });
    });
  }

  function noteText(tweet) {
    return tweet.note_tweet?.note_tweet_results?.result?.text || null;
  }

  // The post a repost points at: its id, author and full text, for the history.
  function original(result) {
    const t = result?.__typename === "TweetWithVisibilityResults" ? result.tweet : result;
    if (!t || !t.rest_id) return null;
    const user = t.core?.user_results?.result;
    return {
      id: t.rest_id,
      user: user?.core?.screen_name || user?.legacy?.screen_name || null,
      text: noteText(t) || XHistory.details(t.legacy || {}).text || null,
    };
  }

  // Walks a timeline response, collecting the signed-in user's own entries and the
  // bottom cursor. Each item is tagged so the engine can filter by type.
  function collect(body, me) {
    const items = [];
    const seen = new Set(); // a wrapped tweet (TweetWithVisibilityResults) is reached twice
    let bottom = null;
    let postCount = null; // the profile's post count, for the progress of a full read
    (function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.cursorType === "Bottom" && node.value) bottom = node.value;
      if (node.__typename === "User" && node.rest_id === me && node.legacy?.statuses_count != null)
        postCount = Number(node.legacy.statuses_count) || null;
      const tweet = node.__typename === "TweetWithVisibilityResults" ? node.tweet : node;
      const legacy = tweet && tweet.legacy;
      if (tweet && tweet.rest_id && legacy && legacy.user_id_str === me && legacy.created_at && !seen.has(tweet.rest_id)) {
        seen.add(tweet.rest_id);
        const isRepost = !!legacy.retweeted_status_result;
        const { text, media, links, replyTo } = XHistory.details(legacy);
        items.push({
          id: tweet.rest_id,
          createdAt: legacy.created_at,
          kind: isRepost ? "repost" : replyTo ? "reply" : "post",
          // Posts over 280 characters keep their full text in note_tweet; full_text is cut.
          text: noteText(tweet) || text,
          media,
          links,
          replyTo,
          repostOf: isRepost ? original(legacy.retweeted_status_result.result) : null,
        });
      }
      for (const k in node) walk(node[k]);
    })(body);
    return { items, bottom, postCount };
  }

  function mutate(opName, variables) {
    return withOperation(opName, (op) =>
      fetch(`${api}/${op.queryId}/${opName}`, {
        method: "POST",
        credentials: "include",
        headers: headers(),
        body: JSON.stringify({ variables, queryId: op.queryId }),
      })
    );
  }

  // Turns an HTTP result into one of: ok | gone | limited | auth | transient | error.
  // "transient" is X (or the connection) failing for a moment — no answer, a 5xx, an empty or
  // non-JSON body, "over capacity": the item is fine and is tried again later. "error" is about
  // this one item, which is counted as a failure and skipped.
  function classify(res, okPayload) {
    const errors = res.body?.errors || [];
    const code = (c) => errors.some((e) => e.code === c);
    const message = errors.map((e) => e.message).join("; ") || res.error || "";
    if (res.status === 429 || code(88)) return { outcome: "limited", rate: res.rate };
    if (res.status === 401 || res.status === 403 || code(32) || code(64) || code(326))
      return { outcome: "auth", message };
    if (okPayload) return { outcome: "ok" };
    // Still 404 after reading the bundle again: the operation itself changed.
    if (res.status === 404) return { outcome: "auth", message: "endpoint changed (404)" };
    // 144 / "No status found" means it is already gone — treat as done, not a failure.
    if (code(144) || errors.some((e) => /no status found|not found/i.test(e.message))) return { outcome: "gone" };
    if (res.status === 0 || res.status >= 500 || !res.body || code(130) || code(131))
      return { outcome: "transient", status: res.status, message: message || "no answer" };
    return { outcome: "error", status: res.status, message };
  }

  // A page that came back 200 but without timeline data (an error body, or nothing) is a passing
  // problem, not the end of the timeline.
  const hasTimeline = (body) => !!body?.data && !(body.errors?.length && !body.data.user);

  return {
    BEARER,
    // Exposed for tests; not used by the rest of the extension.
    _classify: classify,
    _hasTimeline: hasTimeline,
    userId,
    ensureMeta,
    // Returns one page of the given profile timeline, with the user's own items only.
    async profilePage(opName, cursor, count = 100) {
      const me = userId();
      const variables = { userId: me, count, includePromotedContent: false, withCommunity: true, withVoice: true };
      if (cursor) variables.cursor = cursor;
      const res = await timelinePage(opName, variables);
      // `transient`: worth retrying the same page (no answer, a 5xx, or a 200 without data).
      const transient = res.status === 0 || res.status >= 500 || (res.status === 200 && !hasTimeline(res.body));
      if (res.status !== 200 || transient) return { ...res, items: [], bottom: null, transient };
      const { items, bottom, postCount } = collect(res.body, me);
      return { ...res, items, bottom, postCount, transient: false };
    },
    // Deletes one of the user's own posts, replies or reposts. A repost is deleted by its own id
    // (the one the archive and the timeline give us); DeleteRetweet would need the original
    // post's id instead, which the archive doesn't carry.
    async deletePost(id) {
      const res = await mutate("DeleteTweet", { tweet_id: id, dark_request: false });
      return classify(res, res.body?.data?.delete_tweet);
    },
    // Removes one like.
    async removeLike(id) {
      const res = await mutate("UnfavoriteTweet", { tweet_id: id });
      return classify(res, res.body?.data?.unfavorite_tweet);
    },
  };
})();

// Allow the pure parts to be imported by the Node test suite. The browser ignores this.
if (typeof module !== "undefined" && module.exports) module.exports = globalThis.XApi;
