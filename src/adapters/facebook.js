// Facebook adapter. Facebook has no API for deleting your own posts, so this
// works the Activity Log page ("Your posts") the way you would: scroll to
// load posts, then for each one click "⋯" → "Move to trash" → confirm.
//
// It relies on the English UI. Selectors and labels live in SEL / TEXT below
// so they can be updated in one place when Facebook changes its markup.

(() => {
  const { sleep, waitFor, isVisible, firstLine, findByText, click, pressEscape } = globalThis.__socialCleanupDom;

  const SEL = {
    main: '[role="main"]',
    rowMenuButton: '[aria-label="Action options"], [aria-label="More options"]',
    heading: 'h2, h3, [role="heading"]',
    menuItem: '[role="menuitem"]',
    dialog: '[role="dialog"]',
    dialogButton: '[role="button"], button',
    postLink: 'a[href*="/posts/"], a[href*="story_fbid"], a[href*="/permalink/"], a[href*="/photos/"], a[href*="/videos/"]',
    loggedInMarker: '[aria-label="Your profile"], [aria-label="Account controls and settings"]',
  };
  const TEXT = {
    preferTrash: /^move to (trash|recycle bin)$/i,
    deleteItem: /^(move to (trash|recycle bin)|delete|delete post|remove)$/i,
    confirm: /^(move to (trash|recycle bin)|move|delete|remove|confirm)$/i,
    removed: /moved to (trash|recycle bin)|has been deleted|post deleted/i,
    blocked: /temporarily blocked|can't use this feature right now/i,
  };
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const ID_ATTR = 'data-social-cleanup-id';

  const seen = new Set();

  const cookie = (name) =>
    document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1);

  const userId = () => (/^\d+$/.test(cookie('c_user') || '') ? cookie('c_user') : null);
  const activityUrl = () => `https://www.facebook.com/${userId() || 'me'}/allactivity?category_key=MANAGEPOSTS`;
  const root = () => document.querySelector(SEL.main) || document.body;
  const blocked = () => [...document.querySelectorAll(SEL.dialog)].some((d) => TEXT.blocked.test(d.innerText || ''));

  // Date headings: "Today", "Yesterday", "March 3", "March 3, 2016"
  function parseHeading(text, now = new Date()) {
    const t = text.trim().toLowerCase();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (t === 'today') return today;
    if (t === 'yesterday') return today - DAY_MS;
    const m = t.match(/^([a-z]+) (\d{1,2})(?:, (\d{4}))?$/);
    const month = m ? MONTHS.indexOf(m[1]) : -1;
    if (month < 0) return null;
    let date = new Date(m[3] ? Number(m[3]) : now.getFullYear(), month, Number(m[2]));
    if (!m[3] && date.getTime() > today) date = new Date(now.getFullYear() - 1, month, Number(m[2]));
    return date.getTime();
  }

  function parseTime(text) {
    const m = text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
    if (!m) return 0;
    const hours = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
    return (hours * 60 + Number(m[2])) * 60 * 1000;
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // A row is the largest ancestor of a "⋯" button that contains no other row's button.
  function rowFor(button, container) {
    let el = button;
    while (el.parentElement && el.parentElement !== container && el.parentElement.querySelectorAll(SEL.rowMenuButton).length === 1) {
      el = el.parentElement;
    }
    return el;
  }

  function toPost(row, dayStart) {
    const lines = (row.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const timeOfDay = parseTime(row.innerText || '');
    const content = lines.filter((l) => !/^\d{1,2}:\d{2}\s*(am|pm)$/i.test(l));
    const link = row.querySelector(SEL.postLink)?.href || null;
    // Unknown date stays null, so date-range filters never select it by accident.
    const createdAt = dayStart == null ? null : dayStart + timeOfDay;
    return {
      id: link ? `fb:${link.split('#')[0]}` : `fb:${createdAt}:${hash(content.join('\n'))}`,
      type: 'post',
      createdAt,
      title: content[0] || '',
      text: content.slice(1).join(' '),
      url: link || activityUrl(),
      mediaUrls: [],
      community: null,
      engagement: {},
    };
  }

  // Reads every row currently on the page, tagging each with its id.
  // Headings and buttons come back in document order, so each row takes the
  // date of the heading above it.
  function readRows() {
    const container = root();
    const posts = [];
    const ids = new Set();
    let day = null;
    for (const el of container.querySelectorAll(`${SEL.heading}, ${SEL.rowMenuButton}`)) {
      if (!el.matches(SEL.rowMenuButton)) {
        const parsed = parseHeading(el.innerText || '');
        if (parsed != null) day = parsed;
        continue;
      }
      const row = rowFor(el, container);
      const post = toPost(row, day);
      // Two identical posts on the same day: keep ids unique.
      let id = post.id;
      for (let n = 2; ids.has(id); n++) id = `${post.id}#${n}`;
      ids.add(id);
      post.id = id;
      row.setAttribute(ID_ATTR, id);
      posts.push(post);
    }
    return posts;
  }

  function findRow(id) {
    const sel = `[${ID_ATTR}="${CSS.escape(id)}"]`;
    let row = document.querySelector(sel);
    if (!row?.isConnected) {
      readRows(); // the page may have re-rendered; re-tag and look again
      row = document.querySelector(sel);
    }
    return row;
  }

  async function checkLogin() {
    const id = userId();
    const loggedIn = Boolean(id || document.querySelector(SEL.loggedInMarker));
    return loggedIn ? { loggedIn, username: id ? `account ${id}` : 'your account', userId: id } : { loggedIn: false };
  }

  // cursor: { stale } – how many scrolls in a row loaded nothing new
  async function listPage({ cursor, range }) {
    if (!location.pathname.includes('/allactivity')) return { navigate: activityUrl() };
    if (!cursor) {
      seen.clear();
      await waitFor(() => root().querySelector(SEL.rowMenuButton), 15000).catch(() => null);
    }
    if (blocked()) throw new Error('Facebook has temporarily blocked this action. Try again later.');

    const fresh = readRows().filter((p) => !seen.has(p.id));
    fresh.forEach((p) => seen.add(p.id));

    // The Activity Log is newest-first: once we pass the start date we're done.
    if (range?.from != null && fresh.some((p) => p.createdAt && p.createdAt < range.from)) {
      return { posts: fresh, nextCursor: null };
    }

    const before = root().querySelectorAll(SEL.rowMenuButton).length;
    window.scrollTo(0, document.documentElement.scrollHeight);
    const grew = await waitFor(() => root().querySelectorAll(SEL.rowMenuButton).length > before, 6000).then(
      () => true,
      () => false,
    );
    const stale = grew ? 0 : (cursor?.stale || 0) + 1;
    return { posts: fresh, nextCursor: stale >= 2 ? null : { stale } };
  }

  async function deletePost({ post }) {
    if (!location.pathname.includes('/allactivity')) return { ok: false, error: 'Not on the Activity Log page. Scan again.' };
    if (blocked()) return { ok: false, rateLimited: true };
    const row = findRow(post.id);
    if (!row) return { ok: false, error: 'Post is no longer on the page (it may already be gone). Scan again to check.' };

    await click(row.querySelector(SEL.rowMenuButton));
    let items;
    try {
      items = await waitFor(() => {
        const visible = [...document.querySelectorAll(SEL.menuItem)].filter(isVisible);
        return visible.length ? visible : null;
      });
    } catch {
      return { ok: false, error: "The post's menu didn't open" };
    }
    const item = items.find((i) => TEXT.preferTrash.test(firstLine(i))) || items.find((i) => TEXT.deleteItem.test(firstLine(i)));
    if (!item) {
      pressEscape();
      return { ok: false, error: `No delete option in menu (${items.map(firstLine).join(', ')})` };
    }
    await click(item);

    // Usually a confirmation dialog follows; sometimes the row just goes.
    const confirm = await waitFor(() => {
      if (!row.isConnected) return 'gone';
      for (const dialog of document.querySelectorAll(SEL.dialog)) {
        const button = findByText(SEL.dialogButton, TEXT.confirm, dialog);
        if (button && button.getAttribute('aria-disabled') !== 'true') return button;
      }
      return null;
    }).catch(() => null);
    if (blocked()) return { ok: false, rateLimited: true };
    if (confirm && confirm !== 'gone') await click(confirm);

    const done = await waitFor(() => !row.isConnected || !isVisible(row) || TEXT.removed.test(row.innerText || ''), 10000).then(
      () => true,
      () => false,
    );
    if (blocked()) return { ok: false, rateLimited: true };
    await sleep(300);
    return done ? { ok: true } : { ok: false, error: "Facebook didn't confirm the deletion" };
  }

  (globalThis.__socialCleanupAdapters ||= []).push({
    id: 'facebook',
    matchesHost: (host) => host === 'facebook.com' || host.endsWith('.facebook.com'),
    checkLogin,
    listPage,
    deletePost,
  });
})();
