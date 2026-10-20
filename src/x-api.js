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
      "DeleteRetweet",
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

  async function timelinePage(opName, variables) {
    const { operations, featureValues } = await ensureMeta();
    const op = operations[opName];
    if (!op) throw new Error("operation-missing:" + opName);
    const u = new URL(`${api}/${op.queryId}/${opName}`);
    u.searchParams.set("variables", JSON.stringify(variables));
    u.searchParams.set("features", JSON.stringify(featuresFor(op, featureValues)));
    u.searchParams.set("fieldToggles", JSON.stringify(togglesFor(op)));
    const r = await fetch(u.toString(), { credentials: "include", headers: headers() });
    return parseRate(r, await r.json().catch(() => null));
  }

  // Walks a timeline response, collecting the signed-in user's own entries and the
  // bottom cursor. Each item is tagged so the engine can filter by type.
  function collect(body, me) {
    const items = [];
    let bottom = null;
    (function walk(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (node.cursorType === "Bottom" && node.value) bottom = node.value;
      const tweet = node.__typename === "TweetWithVisibilityResults" ? node.tweet : node;
      const legacy = tweet && tweet.legacy;
      if (tweet && tweet.rest_id && legacy && legacy.user_id_str === me && legacy.created_at) {
        const isRepost = !!legacy.retweeted_status_result;
        const isReply = !!legacy.in_reply_to_status_id_str;
        items.push({
          id: tweet.rest_id,
          createdAt: legacy.created_at,
          kind: isRepost ? "repost" : isReply ? "reply" : "post",
          text: (legacy.full_text || "").slice(0, 80),
        });
      }
      for (const k in node) walk(node[k]);
    })(body);
    return { items, bottom };
  }

  async function mutate(opName, variables) {
    const { operations } = await ensureMeta();
    const op = operations[opName];
    if (!op) throw new Error("operation-missing:" + opName);
    const r = await fetch(`${api}/${op.queryId}/${opName}`, {
      method: "POST",
      credentials: "include",
      headers: headers(),
      body: JSON.stringify({ variables, queryId: op.queryId }),
    });
    return parseRate(r, await r.json().catch(() => null));
  }

  // Turns an HTTP result into one of: ok | gone | limited | auth | error.
  function classify(res, okPayload) {
    const errors = res.body?.errors || [];
    const code = (c) => errors.some((e) => e.code === c);
    if (res.status === 429 || code(88)) return { outcome: "limited", rate: res.rate };
    if (res.status === 401 || res.status === 403 || code(32) || code(64) || code(326))
      return { outcome: "auth", message: errors.map((e) => e.message).join("; ") };
    if (okPayload) return { outcome: "ok" };
    // 144 / "No status found" means it is already gone — treat as done, not a failure.
    if (code(144) || errors.some((e) => /no status found|not found/i.test(e.message)))
      return { outcome: "gone" };
    if (res.status === 404) return { outcome: "auth", message: "endpoint changed (404)" };
    return { outcome: "error", status: res.status, message: errors.map((e) => e.message).join("; ") };
  }

  return {
    BEARER,
    userId,
    ensureMeta,
    // Returns one page of the given profile timeline, with the user's own items only.
    async profilePage(opName, cursor, count = 100) {
      const me = userId();
      const variables = { userId: me, count, includePromotedContent: false, withCommunity: true, withVoice: true };
      if (cursor) variables.cursor = cursor;
      const res = await timelinePage(opName, variables);
      if (res.status !== 200) return { ...res, items: [], bottom: null };
      const { items, bottom } = collect(res.body, me);
      return { ...res, items, bottom };
    },
    // Deletes one of the user's own posts (or replies).
    async deletePost(id) {
      const res = await mutate("DeleteTweet", { tweet_id: id, dark_request: false });
      return classify(res, res.body?.data?.delete_tweet);
    },
    // Undoes one of the user's reposts.
    async deleteRepost(id) {
      const res = await mutate("DeleteRetweet", { source_tweet_id: id, dark_request: false });
      return classify(res, res.body?.data?.unretweet);
    },
    // Removes one like.
    async removeLike(id) {
      const res = await mutate("UnfavoriteTweet", { tweet_id: id });
      return classify(res, res.body?.data?.unfavorite_tweet);
    },
  };
})();
