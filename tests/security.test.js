// Security regression tests: each one tries an attack the audit found.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { safeUrl, isFromExtensionPage, isFromContentScript, isXBundleUrl } from '../src/shared/security.js';
import { listZip, readZipEntryText } from '../src/shared/zip.js';
import { buildBackupHtml } from '../src/shared/backup.js';
import { createJobManager } from '../src/background/jobManager.js';
import { createMemoryStore } from '../src/background/store.js';
import { makeZip } from './helpers/makeZip.js';

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXT_ORIGIN = `chrome-extension://${EXT_ID}/`;

test('only http(s) links are allowed', () => {
  assert.equal(safeUrl('https://x.com/a/status/1'), 'https://x.com/a/status/1');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'chrome://settings', '', null, undefined, 'not a url']) {
    assert.equal(safeUrl(bad), null, `should block ${bad}`);
  }
});

test('state-changing commands are only accepted from the side panel', () => {
  const panel = { id: EXT_ID, url: `${EXT_ORIGIN}src/sidepanel/index.html` };
  assert.equal(isFromExtensionPage(panel, EXT_ID, EXT_ORIGIN), true);
  // The panel page opened in a tab is still the panel
  assert.equal(isFromExtensionPage({ ...panel, tab: { id: 2 } }, EXT_ID, EXT_ORIGIN), true);
  // From a content script inside a website
  assert.equal(isFromExtensionPage({ ...panel, tab: { id: 1 }, url: 'https://x.com/home' }, EXT_ID, EXT_ORIGIN), false);
  // From another extension
  assert.equal(isFromExtensionPage({ ...panel, id: 'otherextensionid' }, EXT_ID, EXT_ORIGIN), false);
  // Missing sender info
  assert.equal(isFromExtensionPage(undefined, EXT_ID, EXT_ORIGIN), false);
  assert.equal(isFromExtensionPage({ id: EXT_ID }, EXT_ID, EXT_ORIGIN), false);
});

test('bundle-fetch requests are only accepted from X tabs', () => {
  const hosts = ['x.com', 'twitter.com'];
  assert.equal(isFromContentScript({ id: EXT_ID, tab: { id: 1 }, url: 'https://x.com/home' }, EXT_ID, hosts), true);
  assert.equal(isFromContentScript({ id: EXT_ID, tab: { id: 1 }, url: 'https://www.reddit.com/' }, EXT_ID, hosts), false);
  assert.equal(isFromContentScript({ id: EXT_ID, tab: { id: 1 }, url: 'https://x.com.evil.example/' }, EXT_ID, hosts), false);
  assert.equal(isFromContentScript({ id: EXT_ID, url: 'https://x.com/home' }, EXT_ID, hosts), false);
});

test('only X\'s real script host can be fetched', () => {
  assert.equal(isXBundleUrl('https://abs.twimg.com/responsive-web/client-web/main.abc.js'), true);
  for (const bad of [
    'https://evil.example/abs.twimg.com/responsive-web/client-web/main.x.js',
    'https://abs.twimg.com.evil.example/responsive-web/main.js',
    'https://abs.twimg.com@evil.example/responsive-web/main.js',
    'https://user:pw@abs.twimg.com/responsive-web/main.js',
    'http://abs.twimg.com/responsive-web/main.js',
    'https://abs.twimg.com/other/main.js',
    'https://abs.twimg.com/responsive-web/data.json',
  ]) {
    assert.equal(isXBundleUrl(bad), false, `should block ${bad}`);
  }
});

test('zip bomb: an entry that inflates past the limit is refused', async () => {
  const zip = makeZip([['data/tweets.js', 'a'.repeat(3 * 1024 * 1024)]]);
  const file = new File([zip], 'bomb.zip');
  const [entry] = await listZip(file);
  // Lie about the size so only the streaming cap can catch it.
  await assert.rejects(readZipEntryText(file, { ...entry, size: 10 }, 1024 * 1024), /too large/);
  // An honest oversize declaration is refused before reading anything.
  await assert.rejects(readZipEntryText(file, entry, 1024 * 1024), /too large/);
  // Within the limit it reads fine.
  assert.equal((await readZipEntryText(file, entry, 4 * 1024 * 1024)).length, 3 * 1024 * 1024);
});

test('backup file cannot run scripts from post content', () => {
  const html = buildBackupHtml(
    [{ id: '1', type: 'post', createdAt: 0, title: '<script>alert(1)</script>', text: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', mediaUrls: ['javascript:alert(2)', 'https://ok.example/a.jpg'] }],
    { platform: 'X', user: '<b>me</b>', exportedAt: 0 },
  );
  assert.ok(!/<script>alert/i.test(html));
  assert.ok(!/<img src=x/i.test(html));
  assert.ok(!/href="javascript:/i.test(html));
  assert.ok(html.includes('href="https://ok.example/a.jpg"'));
  assert.ok(html.includes("Content-Security-Policy"), 'backup page should forbid scripts');
});

test('starting over and switching account wipe the saved posts', async () => {
  const store = createMemoryStore();
  const jobs = createJobManager({
    store,
    adapter: { call: async () => ({ loggedIn: true, username: 'me' }) },
    platforms: { reddit: { name: 'Reddit', limits: { delayMs: 0, maxPerHour: 10, scanDelayMs: 0 } } },
    sleep: async () => {},
  });
  await jobs.checkLogin('reddit');
  await jobs.importPosts({ posts: [{ id: 'a', type: 'post', createdAt: 1 }] });
  assert.equal((await store.getPosts('reddit')).length, 1);
  await jobs.reset();
  assert.equal((await store.getPosts('reddit')).length, 0);

  await jobs.importPosts({ posts: [{ id: 'b', type: 'post', createdAt: 1 }] });
  await jobs.disconnect();
  assert.equal((await store.getPosts('reddit')).length, 0);
});

test('no credentials or API keys anywhere in the repository or its history', () => {
  const patterns = [
    /AAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%]{40,}/, // X/Twitter bearer tokens
    /sk-ant-[A-Za-z0-9_-]{10,}/, // Anthropic API keys
    /\bsk-[A-Za-z0-9]{32,}/, // OpenAI-style keys
    /gh[pousr]_[A-Za-z0-9]{30,}/, // GitHub tokens
    /github_pat_[A-Za-z0-9_]{30,}/,
    /AKIA[0-9A-Z]{16}/, // AWS
    /xox[baprs]-[A-Za-z0-9-]{10,}/, // Slack
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
  for (const file of files) {
    if (file === 'tests/security.test.js' || file === 'package-lock.json') continue;
    const text = readFileSync(file, 'utf8');
    for (const re of patterns) assert.ok(!re.test(text), `${file} matches ${re}`);
  }
});

test('the extension asks for no more permissions than it needs', () => {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
  assert.deepEqual(manifest.permissions.sort(), ['alarms', 'sidePanel', 'storage', 'unlimitedStorage']);
  assert.equal(manifest.externally_connectable, undefined, 'websites must not be able to message the extension');
  for (const host of manifest.host_permissions) {
    assert.match(host, /^\*:\/\/(\*\.)?(reddit\.com|x\.com|twitter\.com|abs\.twimg\.com|facebook\.com)\/\*$/);
  }
});

test('finishing a cleanup erases the post list, username and log (keeps only failed items)', async () => {
  const store = createMemoryStore();
  const posts = ['a', 'b', 'c'].map((id) => ({ id, type: 'post', createdAt: 1, text: `secret ${id}` }));
  const jobs = createJobManager({
    store,
    adapter: {
      call: async (_p, method, args) => {
        if (method === 'checkLogin') return { loggedIn: true, username: 'me', userId: '42' };
        if (method === 'deletePost') return args.post.id === 'c' ? { ok: false, error: 'boom' } : { ok: true };
      },
    },
    platforms: { reddit: { name: 'Reddit', limits: { delayMs: 0, maxPerHour: 10, scanDelayMs: 0 } } },
    sleep: async () => {},
  });
  await jobs.checkLogin('reddit');
  await jobs.importPosts({ posts });
  await jobs.start({ ids: ['a', 'b', 'c'], options: {} });

  const job = await store.getJob();
  assert.equal(job.status, 'done');
  assert.equal(job.deleted, 2);
  assert.equal(job.user, null);
  assert.equal(job.userId, null);
  assert.deepEqual(job.log, []);
  assert.deepEqual(job.queue, []);
  assert.deepEqual((await store.getPosts('reddit')).map((p) => p.id), ['c'], 'only the failed item is kept, for retry');

  // Retrying the failed item, then finishing again, leaves nothing behind.
  await jobs.start({ ids: ['c'], options: {} });
  assert.deepEqual((await store.getPosts('reddit')).map((p) => p.id), ['c']);
});

test('"Clear all my data" erases everything, even mid-cleanup', async () => {
  const store = createMemoryStore();
  const jobs = createJobManager({
    store,
    adapter: {
      call: async (_p, method) => {
        if (method === 'checkLogin') return { loggedIn: true, username: 'me' };
        if (method === 'deletePost') {
          await jobs.clearAll(); // user clicks "Clear all my data" while a delete is in flight
          return { ok: true };
        }
      },
    },
    platforms: { reddit: { name: 'Reddit', limits: { delayMs: 0, maxPerHour: 10, scanDelayMs: 0 } } },
    sleep: async () => {},
  });
  await jobs.checkLogin('reddit');
  await jobs.importPosts({ posts: [{ id: 'a', type: 'post', createdAt: 1 }, { id: 'b', type: 'post', createdAt: 1 }] });
  await jobs.start({ ids: ['a', 'b'], options: {} });
  assert.equal(await store.getJob(), null, 'nothing written back after clearing');
  assert.deepEqual(store.data.posts, {});
});
