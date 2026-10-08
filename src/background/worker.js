// Service worker entry point: wires the job manager to Chrome APIs and
// routes messages from the side panel.

import { createJobManager } from './jobManager.js';
import { chromeStore } from './store.js';
import { PLATFORMS } from '../shared/platforms.js';
import { isFromContentScript, isFromExtensionPage, isXBundleUrl } from '../shared/security.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Only the extension's own pages and worker may read stored data. Content
// scripts run inside the social sites' pages and never need it, so a
// compromised site page can't read lists of posts from other sites.
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome stops idle service workers after ~30s. Calling an extension API
// resets that timer, so long waits are chunked with a cheap API call.
async function keepAliveSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await pause(Math.min(20000, end - Date.now()));
    await chrome.runtime.getPlatformInfo();
  }
}

async function waitForTabLoad(tabId) {
  for (let i = 0; i < 60; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await pause(500);
  }
}

// Tabs the extension opened itself. Only these are ever navigated, so we
// never yank a tab the user is reading to another page.
async function getWorkTabs() {
  return (await chrome.storage.session.get('workTabs')).workTabs || {};
}

async function openWorkTab(platform, url) {
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.session.set({ workTabs: { ...(await getWorkTabs()), [platform]: tab.id } });
  return tab;
}

async function findTab(platform) {
  const cfg = PLATFORMS[platform];
  const ownId = (await getWorkTabs())[platform];
  const own = ownId != null ? await chrome.tabs.get(ownId).catch(() => null) : null;
  if (own) return { tab: own, own: true };

  const tabs = await chrome.tabs.query({ url: cfg.tabMatch });
  const existing =
    (cfg.preferTab && tabs.find((t) => cfg.preferTab.test(t.url || ''))) ||
    tabs.find((t) => t.url?.startsWith(cfg.tabUrl)) ||
    tabs[0];
  if (existing) return { tab: existing, own: false };
  return { tab: await openWorkTab(platform, cfg.tabUrl), own: true };
}

// Confirms the adapter's content script is listening in the tab.
async function waitForAdapter(tabId, platform) {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { target: 'adapter', method: 'ping' });
      if (res?.result?.platform === platform) return;
    } catch {
      // content script not ready yet
    }
    await pause(500);
  }
  throw new Error(`Couldn't connect to the ${PLATFORMS[platform].name} tab. Try reloading it.`);
}

const adapter = {
  async call(platform, method, args) {
    let lastError;
    // One retry covers the user closing or reloading the tab mid-job.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let { tab, own } = await findTab(platform);
        // An adapter can ask to be on a specific page first ({ navigate: url }).
        for (let hops = 0; hops < 3; hops++) {
          await waitForTabLoad(tab.id);
          await waitForAdapter(tab.id, platform);
          const res = await chrome.tabs.sendMessage(tab.id, { target: 'adapter', method, args });
          if (!res) throw new Error('No response from page');
          if (res.error) throw Object.assign(new Error(res.error), { fromAdapter: true });
          if (!res.result?.navigate) return res.result;
          if (own) {
            await chrome.tabs.update(tab.id, { url: res.result.navigate });
          } else {
            tab = await openWorkTab(platform, res.result.navigate);
            own = true;
          }
          await pause(1000);
        }
        throw Object.assign(new Error('The page kept redirecting'), { fromAdapter: true });
      } catch (e) {
        if (e.fromAdapter) throw e;
        lastError = e;
      }
    }
    throw lastError;
  },
};

const jobs = createJobManager({ store: chromeStore, adapter, platforms: PLATFORMS, sleep: keepAliveSleep });

// Commands the side panel can send.
const handlers = {
  checkLogin: (m) => jobs.checkLogin(m.platform),
  scan: (m) => jobs.scan({ range: m.range, types: m.types }),
  importPosts: (m) => jobs.importPosts({ posts: m.posts, source: m.source }),
  start: (m) => jobs.start({ ids: m.ids, options: m.options }),
  pause: () => jobs.pause(),
  resume: () => jobs.resume(),
  reset: () => jobs.reset(),
  disconnect: () => jobs.disconnect(),
  clearAll: () => jobs.clearAll(),
};

// Lets the X adapter read x.com's public script bundle if CORS blocks it in
// the page. Restricted to X's own static script host; no cookies are sent.
async function fetchText(url) {
  if (!isXBundleUrl(url)) return { error: 'URL not allowed' };
  try {
    const res = await fetch(url, { credentials: 'omit' });
    return res.ok ? { text: await res.text() } : { error: `HTTP ${res.status}` };
  } catch (e) {
    return { error: e.message };
  }
}

const EXTENSION_ORIGIN = chrome.runtime.getURL('');
const X_HOSTS = ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com', 'mobile.x.com', 'mobile.twitter.com'];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'fetchText') {
    if (!isFromContentScript(sender, chrome.runtime.id, X_HOSTS)) return;
    fetchText(msg.url).then(sendResponse);
    return true;
  }
  // Everything else changes state, so it must come from our own side panel,
  // never from a script running inside a website.
  if (!isFromExtensionPage(sender, chrome.runtime.id, EXTENSION_ORIGIN)) return;
  if (!Object.hasOwn(handlers, msg?.type)) return;
  if (msg.platform !== undefined && !Object.hasOwn(PLATFORMS, msg.platform)) return;
  const handler = handlers[msg.type];
  // Long-running work continues in the background; the panel follows
  // progress through chrome.storage, so reply immediately.
  handler(msg).catch((e) => console.error(`[social-cleanup] ${msg.type} failed`, e));
  sendResponse({ ok: true });
});

// Resume an in-progress job after the worker was restarted.
async function resumeIfNeeded() {
  const job = await chromeStore.getJob();
  if (job?.status === 'running' && !jobs.running) jobs.run();
}

chrome.alarms.create('resume-check', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => a.name === 'resume-check' && resumeIfNeeded());
resumeIfNeeded();
