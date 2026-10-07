// X / Twitter adapter. Runs as a content script on x.com. Posts come from the
// user's data archive (X's timeline only exposes the latest ~3,200), so this
// adapter only checks login and deletes, using the same internal API calls
// x.com itself makes when you click "Delete".

(() => {
  // No credentials ship with this extension. x.com's own web app script
  // contains the public token its pages use, plus the current ID of each
  // operation; they are read from there at runtime. These operation IDs are
  // only fallbacks (they are not secrets).
  const FALLBACK_QUERY_IDS = {
    DeleteTweet: 'VaenaVgh5q5ih7kvyVjgtg',
    UnfavoriteTweet: 'ZYKSe-w7KEslx3JhSIk5LA',
  };

  // Same rule as isXBundleUrl in src/shared/security.js (content scripts
  // can't import modules).
  function isBundleUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.host === 'abs.twimg.com' && /^\/responsive-web\/client-web[^/]*\/main\.[\w.-]+\.js$/.test(u.pathname);
    } catch {
      return false;
    }
  }

  let config = null;

  const cookie = (name) =>
    document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  async function fetchBundle(url) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (res.ok) return await res.text();
    } catch {
      // CORS or network; fall back to the background worker
    }
    const res = await chrome.runtime.sendMessage({ type: 'fetchText', url });
    return res?.text || '';
  }

  // x.com's main bundle contains the API token and the current IDs of each
  // GraphQL operation; reading them keeps us working when X rotates them.
  async function discover() {
    const found = { bearer: null, queryIds: {} };
    const urls = [...document.querySelectorAll('script[src]')].map((s) => s.src).filter(isBundleUrl);
    for (const url of urls) {
      const js = await fetchBundle(url);
      found.bearer ||= js.match(/"(AAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%]{30,})"/)?.[1] || null;
      for (const op of Object.keys(FALLBACK_QUERY_IDS)) {
        const m = js.match(new RegExp(`queryId:"([\\w-]+)",operationName:"${op}"`));
        if (m) found.queryIds[op] = m[1];
      }
    }
    return found;
  }

  async function getConfig(refresh = false) {
    if (config && !refresh) return config;
    let found = { bearer: null, queryIds: {} };
    try {
      found = await discover();
    } catch {
      // use defaults
    }
    config = { bearer: found.bearer, queryIds: { ...FALLBACK_QUERY_IDS, ...found.queryIds } };
    return config;
  }

  function headers(cfg) {
    return {
      authorization: `Bearer ${cfg.bearer}`,
      'x-csrf-token': cookie('ct0') || '',
      'x-twitter-auth-type': 'OAuth2Session',
      'x-twitter-active-user': 'yes',
      'content-type': 'application/json',
    };
  }

  async function checkLogin() {
    if (!cookie('ct0')) return { loggedIn: false };
    const userId = decodeURIComponent(cookie('twid') || '').match(/u=(\d+)/)?.[1] || null;
    const cfg = await getConfig();
    if (!cfg.bearer) return userId ? { loggedIn: true, username: `account ${userId}`, userId } : { loggedIn: false };
    try {
      const res = await fetch('/i/api/1.1/account/settings.json', { credentials: 'include', headers: headers(cfg) });
      if (res.status === 401 || res.status === 403) return { loggedIn: false };
      if (res.ok) {
        const { screen_name } = await res.json();
        if (screen_name) return { loggedIn: true, username: `@${screen_name}`, userId };
      }
    } catch {
      // fall through to the cookie-based answer
    }
    return userId ? { loggedIn: true, username: `account ${userId}`, userId } : { loggedIn: false };
  }

  const SETUP_ERROR = "Couldn't read x.com's page setup. Reload your x.com tab and try again.";

  async function gql(op, variables, retried = false) {
    const cfg = await getConfig(retried);
    if (!cfg.bearer) {
      if (!retried) return gql(op, variables, true);
      return { ok: false, error: SETUP_ERROR };
    }
    const queryId = cfg.queryIds[op];
    const res = await fetch(`/i/api/graphql/${queryId}/${op}`, {
      method: 'POST',
      credentials: 'include',
      headers: headers(cfg),
      body: JSON.stringify({ variables, queryId }),
    });
    if (res.status === 429) return { ok: false, rateLimited: true };
    // A stale operation ID gives 400/404: re-read the bundle once and retry.
    if ((res.status === 400 || res.status === 404) && !retried) return gql(op, variables, true);
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'X refused the request. Are you still logged in?' };
    if (!res.ok) {
      const hint = res.status === 404 ? ' (X may have changed its internal API; the extension needs an update)' : '';
      return { ok: false, error: `X returned HTTP ${res.status}${hint}` };
    }
    const body = await res.json().catch(() => ({}));
    const errors = body.errors || [];
    if (!errors.length) return { ok: true };
    if (errors.some((e) => e.code === 88)) return { ok: false, rateLimited: true };
    // Already deleted / already unliked counts as done.
    if (errors.every((e) => e.code === 144 || /not found|no status/i.test(e.message || ''))) return { ok: true };
    return { ok: false, error: errors.map((e) => e.message).join('; ') };
  }

  async function listPage() {
    throw new Error('X posts are imported from your data archive');
  }

  async function deletePost({ post }) {
    if (post.type === 'like') return gql('UnfavoriteTweet', { tweet_id: post.tweetId });
    return gql('DeleteTweet', { tweet_id: post.id, dark_request: false });
  }

  (globalThis.__socialCleanupAdapters ||= []).push({
    id: 'x',
    matchesHost: (host) => ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com', 'mobile.x.com', 'mobile.twitter.com'].includes(host),
    checkLogin,
    listPage,
    deletePost,
  });
})();
