// Reddit adapter. Runs as a content script on reddit.com and uses the same
// JSON endpoints the site itself uses, authenticated by your existing login.
//
// Every adapter registers an object with the same shape:
//   id, matchesHost(host), checkLogin(), listPage({cursor, range, types}),
//   deletePost({post, options})

(() => {
  // Reddit listings stop at ~1000 items. If "new" hits that cap we also walk
  // the other sort orders, which surfaces older items beyond it.
  const SORTS = ['new', 'top', 'controversial', 'hot'];
  const LISTING_CAP = 990;
  const OVERWRITE_TEXT = '.';

  let session = null;

  async function getSession(force = false) {
    if (session && !force) return session;
    const res = await fetch('/api/me.json', { credentials: 'include' });
    if (!res.ok) throw new Error(`Reddit returned ${res.status} while checking login`);
    const body = await res.json();
    const data = body?.data;
    session = data?.name && data?.modhash ? { username: data.name, modhash: data.modhash } : null;
    return session;
  }

  async function postForm(path, fields) {
    const s = await getSession();
    if (!s) throw new Error('Logged out of Reddit');
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Modhash': s.modhash },
      body: new URLSearchParams({ ...fields, uh: s.modhash }),
    });
  }

  function toPost(child) {
    const d = child.data;
    const isPost = child.kind === 't3';
    return {
      id: d.name, // fullname, e.g. t3_abc123 / t1_def456
      type: isPost ? 'post' : 'comment',
      createdAt: Math.round(d.created_utc * 1000),
      title: isPost ? d.title : d.link_title || '',
      text: isPost ? d.selftext || '' : d.body || '',
      url: `https://www.reddit.com${d.permalink}`,
      mediaUrls: isPost && !d.is_self && d.url ? [d.url] : [],
      community: d.subreddit,
      engagement: { score: d.score ?? 0, comments: isPost ? d.num_comments : undefined },
      editable: isPost ? Boolean(d.is_self) : true,
    };
  }

  async function checkLogin() {
    const s = await getSession(true);
    return { loggedIn: Boolean(s), username: s?.username ?? null };
  }

  // cursor: { li: listing index, si: sort index, after, count }
  async function listPage({ cursor, range, types }) {
    const s = await getSession();
    if (!s) throw new Error('Not logged in to Reddit');

    const listings = [];
    if (types.includes('post')) listings.push('submitted');
    if (types.includes('comment')) listings.push('comments');

    const c = cursor || { li: 0, si: 0, after: null, count: 0 };
    if (c.li >= listings.length) return { posts: [], nextCursor: null };

    const sort = SORTS[c.si];
    const params = new URLSearchParams({ limit: '100', sort, raw_json: '1' });
    if (sort === 'top' || sort === 'controversial') params.set('t', 'all');
    if (c.after) params.set('after', c.after);

    const res = await fetch(`/user/${encodeURIComponent(s.username)}/${listings[c.li]}.json?${params}`, {
      credentials: 'include',
    });
    if (res.status === 429) throw new Error('Reddit is rate-limiting us. Wait a few minutes and scan again.');
    if (!res.ok) throw new Error(`Reddit returned ${res.status} while listing your ${listings[c.li]}`);

    const body = await res.json();
    const children = (body?.data?.children || []).filter((ch) => ch.kind === 't1' || ch.kind === 't3');
    const posts = children.map(toPost);
    const count = c.count + children.length;
    const after = body?.data?.after;

    // "new" is newest-first, so once we pass the start of the range we're done with it.
    const reachedStart = sort === 'new' && range?.from != null && posts.some((p) => p.createdAt < range.from);
    const nextListing = { li: c.li + 1, si: 0, after: null, count: 0 };
    const nextSort = { li: c.li, si: c.si + 1, after: null, count: 0 };

    let next;
    if (after && !reachedStart) next = { ...c, after, count };
    else if (sort === 'new') next = !reachedStart && count >= LISTING_CAP ? nextSort : nextListing;
    else next = c.si + 1 < SORTS.length ? nextSort : nextListing;

    return { posts, nextCursor: next.li < listings.length ? next : null };
  }

  async function deletePost({ post, options }) {
    if (options?.overwrite && post.editable && post.text) {
      const edit = await postForm('/api/editusertext', { thing_id: post.id, text: OVERWRITE_TEXT, api_type: 'json' });
      if (edit.status === 429) return { ok: false, rateLimited: true };
      if (!edit.ok) return { ok: false, error: `Overwrite failed (HTTP ${edit.status})` };
    }

    let res = await postForm('/api/del', { id: post.id });
    if (res.status === 403) {
      // The session token may have rotated; refresh once and retry.
      await getSession(true);
      res = await postForm('/api/del', { id: post.id });
    }
    if (res.status === 429) return { ok: false, rateLimited: true };
    if (!res.ok) return { ok: false, error: `Reddit returned HTTP ${res.status}` };
    return { ok: true };
  }

  (globalThis.__socialCleanupAdapters ||= []).push({
    id: 'reddit',
    matchesHost: (host) => host === 'reddit.com' || host.endsWith('.reddit.com'),
    checkLogin,
    listPage,
    deletePost,
  });
})();
