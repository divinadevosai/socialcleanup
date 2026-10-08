// Per-platform settings the background worker and side panel need. The
// adapter code itself lives in content scripts (src/adapters/*), which run
// inside the site's tab.
//
// scanMode:
//   'live'    – the adapter lists posts from the site (listPage)
//   'archive' – posts come from the user's downloaded data archive

export const PLATFORMS = {
  reddit: {
    id: 'reddit',
    tile: { letter: 'r', color: '#ff4500' },
    signInUrl: 'https://www.reddit.com/login',
    blurb: 'Posts and comments',
    name: 'Reddit',
    scanMode: 'live',
    // Tab the worker opens if none is open. old.reddit.com reliably exposes
    // the session "modhash" that Reddit's delete endpoint requires.
    tabUrl: 'https://old.reddit.com/',
    tabMatch: ['*://*.reddit.com/*'],
    types: [
      { id: 'post', label: 'Posts' },
      { id: 'comment', label: 'Comments' },
    ],
    communityPrefix: 'r/',
    labelFromTitle: true,
    scoreLabel: 'upvotes',
    supportsOverwrite: true,
    limits: { delayMs: 2000, maxPerHour: 600, scanDelayMs: 1000 },
  },

  x: {
    id: 'x',
    tile: { letter: 'X', color: '#14171a' },
    signInUrl: 'https://x.com/login',
    archiveUrl: 'https://x.com/settings/download_your_data',
    blurb: 'Posts, replies, reposts and likes',
    name: 'X / Twitter',
    scanMode: 'archive',
    tabUrl: 'https://x.com/home',
    tabMatch: ['*://x.com/*', '*://twitter.com/*'],
    types: [
      { id: 'post', label: 'Posts' },
      { id: 'reply', label: 'Replies' },
      { id: 'repost', label: 'Reposts' },
      { id: 'like', label: 'Likes' },
    ],
    communityPrefix: null,
    scoreLabel: 'likes',
    supportsOverwrite: false,
    deleteNote: 'Posts, replies and reposts are deleted; likes are removed.',
    limits: { delayMs: 3000, maxPerHour: 500, scanDelayMs: 0 },
  },

  facebook: {
    id: 'facebook',
    tile: { letter: 'f', color: '#1877f2' },
    signInUrl: 'https://www.facebook.com/',
    blurb: 'Posts (moved to trash first)',
    name: 'Facebook',
    scanMode: 'live',
    tabUrl: 'https://www.facebook.com/',
    tabMatch: ['*://*.facebook.com/*'],
    // Prefer a tab already on the Activity Log, where the adapter works.
    preferTab: /\/allactivity/,
    types: [{ id: 'post', label: 'Posts' }],
    communityPrefix: null,
    scoreLabel: null,
    supportsOverwrite: false,
    deleteNote: "Posts go to Facebook's trash, which deletes them for good after 30 days. Keep the Facebook tab open while it runs.",
    // Each Facebook deletion loads menus and dialogs, so it goes slowest.
    limits: { delayMs: 4000, maxPerHour: 300, scanDelayMs: 1500 },
  },
};

// Sites shown as "Coming soon" on the first screen (none right now).
export const COMING_SOON = [];
