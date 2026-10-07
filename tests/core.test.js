import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyFilters, dateInputToMs } from '../src/shared/filters.js';
import { buildBackupHtml, buildBackupJson } from '../src/shared/backup.js';
import { createRateLimiter } from '../src/background/rateLimiter.js';
import { createJobManager, newJob } from '../src/background/jobManager.js';
import { createMemoryStore } from '../src/background/store.js';

const day = (s) => new Date(`${s}T12:00:00`).getTime();
const post = (id, date, extra = {}) => ({
  id,
  type: 'post',
  createdAt: day(date),
  title: `title ${id}`,
  text: '',
  community: 'pics',
  engagement: { score: 1 },
  ...extra,
});

const PLATFORMS = {
  reddit: { name: 'Reddit', limits: { delayMs: 10, maxPerHour: 1000, scanDelayMs: 0 } },
};

// ---------- filters ----------

test('filters by date range inclusive of whole days', () => {
  const posts = [post('a', '2015-01-01'), post('b', '2016-06-15'), post('c', '2018-12-31'), post('d', '2020-01-01')];
  const out = applyFilters(posts, {
    from: dateInputToMs('2016-01-01'),
    to: dateInputToMs('2018-12-31', { endOfDay: true }),
    types: ['post'],
  });
  assert.deepEqual(out.map((p) => p.id), ['b', 'c']);
});

test('filters by type, score, community and keyword', () => {
  const posts = [
    post('a', '2015-01-01', { type: 'comment' }),
    post('b', '2015-01-01', { engagement: { score: 500 } }),
    post('c', '2015-01-01', { community: 'AskHistorians' }),
    post('d', '2015-01-01', { text: 'My wedding photos' }),
    post('e', '2015-01-01'),
  ];
  const out = applyFilters(posts, {
    types: ['post'],
    keepMinScore: 100,
    keepCommunities: 'r/askhistorians, cooking',
    keepKeywords: 'Wedding',
  });
  assert.deepEqual(out.map((p) => p.id), ['e']);
});

// ---------- backup ----------

test('backup escapes HTML and keeps all posts', () => {
  const posts = [post('a', '2015-01-01', { text: '<script>alert(1)</script>' })];
  const meta = { platform: 'Reddit', user: 'me', exportedAt: day('2026-10-07') };
  const html = buildBackupHtml(posts, meta);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
  const json = JSON.parse(buildBackupJson(posts, meta));
  assert.equal(json.count, 1);
  assert.equal(json.posts[0].id, 'a');
});

// ---------- rate limiter ----------

test('rate limiter enforces hourly cap and backs off exponentially', async () => {
  let t = 0;
  const slept = [];
  const sleep = async (ms) => {
    slept.push(ms);
    t += ms;
  };
  const limiter = createRateLimiter({ delayMs: 1000, maxPerHour: 2 }, { sleep, now: () => t });
  await limiter.wait();
  await limiter.wait();
  await limiter.wait(); // third call must wait for the hour window
  assert.ok(slept.some((ms) => ms > 3_000_000), `expected a long wait, got ${slept}`);

  slept.length = 0;
  assert.equal(await limiter.backoff(), 1);
  assert.equal(await limiter.backoff(), 2);
  assert.deepEqual(slept, [30_000, 60_000]);
  limiter.success();
  slept.length = 0;
  await limiter.backoff();
  assert.deepEqual(slept, [30_000]);
});

// ---------- job manager ----------

function fakeAdapter({ items = [], failIds = new Set(), rateLimitOnce = new Set(), loggedIn = true } = {}) {
  const deleted = [];
  return {
    deleted,
    async call(_platform, method, args) {
      if (method === 'checkLogin') return { loggedIn, username: loggedIn ? 'tester' : null };
      if (method === 'listPage') {
        const start = args.cursor ?? 0;
        const page = items.slice(start, start + 2);
        return { posts: page, nextCursor: start + 2 < items.length ? start + 2 : null };
      }
      if (method === 'deletePost') {
        const id = args.post.id;
        if (rateLimitOnce.has(id)) {
          rateLimitOnce.delete(id);
          return { ok: false, rateLimited: true };
        }
        if (failIds.has(id)) return { ok: false, error: 'boom' };
        deleted.push(id);
        return { ok: true };
      }
    },
  };
}

function setup(adapterOpts) {
  const store = createMemoryStore();
  const adapter = fakeAdapter(adapterOpts);
  const jobs = createJobManager({ store, adapter, platforms: PLATFORMS, sleep: async () => {} });
  return { store, adapter, jobs };
}

test('full flow: login, scan (paginated, deduped), delete with retry after rate limit', async () => {
  const items = [post('a', '2015-01-01'), post('b', '2015-01-02'), post('b', '2015-01-02'), post('c', '2015-01-03')];
  const { store, adapter, jobs } = setup({ items, failIds: new Set(['c']), rateLimitOnce: new Set(['b']) });

  let job = await jobs.checkLogin('reddit');
  assert.equal(job.status, 'connected');
  assert.equal(job.user, 'tester');

  job = await jobs.scan({ range: { from: null, to: null }, types: ['post'] });
  assert.equal(job.status, 'ready');
  assert.equal(job.scanned, 3);

  await jobs.start({ ids: ['a', 'b', 'c'], options: {} });
  job = await store.getJob();
  assert.equal(job.status, 'done');
  assert.deepEqual(adapter.deleted, ['a', 'b']);
  assert.equal(job.deleted, 2);
  assert.deepEqual(job.failed, [{ id: 'c', error: 'boom' }]);
});

test('not logged in reports an error and stays idle', async () => {
  const { jobs } = setup({ loggedIn: false });
  const job = await jobs.checkLogin('reddit');
  assert.equal(job.status, 'idle');
  assert.match(job.error, /not logged in/);
});

test('pauses after repeated consecutive failures', async () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => post(id, '2015-01-01'));
  const { store, jobs } = setup({ items, failIds: new Set(items.map((p) => p.id)) });
  await jobs.checkLogin('reddit');
  await jobs.scan({ range: {}, types: ['post'] });
  await jobs.start({ ids: items.map((p) => p.id) });
  const job = await store.getJob();
  assert.equal(job.status, 'paused');
  assert.equal(job.cursor, 5);
  assert.match(job.error, /5 failures in a row/);
});

test('resumes from saved progress (e.g. after the worker restarts)', async () => {
  const items = ['a', 'b', 'c'].map((id) => post(id, '2015-01-01'));
  const { store, adapter, jobs } = setup({ items });
  await store.setPosts('reddit', items);
  await store.setJob({ ...newJob('reddit'), status: 'running', queue: ['a', 'b', 'c'], cursor: 1, deleted: 1 });
  await jobs.run();
  const job = await store.getJob();
  assert.deepEqual(adapter.deleted, ['b', 'c']);
  assert.equal(job.deleted, 3);
  assert.equal(job.status, 'done');
});

test('pausing mid-run stops before the next item', async () => {
  const items = ['a', 'b', 'c'].map((id) => post(id, '2015-01-01'));
  const store = createMemoryStore();
  const adapter = fakeAdapter({ items });
  let jobs;
  const origCall = adapter.call;
  adapter.call = async (...args) => {
    const res = await origCall(...args);
    if (args[1] === 'deletePost' && args[2].post.id === 'a') await jobs.pause();
    return res;
  };
  jobs = createJobManager({ store, adapter, platforms: PLATFORMS, sleep: async () => {} });
  await store.setPosts('reddit', items);
  await store.setJob({ ...newJob('reddit'), status: 'running', queue: ['a', 'b', 'c'] });
  await jobs.run();
  const job = await store.getJob();
  assert.equal(job.status, 'paused');
  assert.deepEqual(adapter.deleted, ['a']);
  assert.equal(job.cursor, 1);
});

test('importing an archive makes posts ready for review', async () => {
  const { store, jobs } = setup();
  await jobs.checkLogin('reddit');
  const posts = [post('a', '2015-01-01'), post('b', '2015-01-02', { type: 'like' })];
  const job = await jobs.importPosts({ posts, source: { accountId: null } });
  assert.equal(job.status, 'ready');
  assert.deepEqual(job.types.sort(), ['like', 'post']);
  assert.equal((await store.getPosts('reddit')).length, 2);
});

test("refuses an archive from a different account than the one logged in", async () => {
  const { store, jobs } = setup();
  await jobs.checkLogin('reddit');
  await store.setJob({ ...(await store.getJob()), userId: '42' });
  const job = await jobs.importPosts({ posts: [post('a', '2015-01-01')], source: { accountId: '99', username: 'someoneelse' } });
  assert.equal(job.status, 'connected');
  assert.match(job.error, /@someoneelse/);
});

test('posts with an unknown date are excluded whenever a date range is set', () => {
  const posts = [post('a', '2015-01-01'), { ...post('b', '2015-01-01'), createdAt: null }];
  assert.deepEqual(applyFilters(posts, { types: ['post'], from: dateInputToMs('2010-01-01') }).map((p) => p.id), ['a']);
  assert.deepEqual(applyFilters(posts, { types: ['post'] }).map((p) => p.id), ['a', 'b']);
});
