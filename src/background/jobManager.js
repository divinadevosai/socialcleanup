// Orchestrates a cleanup: check login → scan → (user previews) → delete.
// Platform-agnostic: it only talks to adapters through `adapter.call()`.
// Progress is saved after every item so a job survives the service worker
// being shut down, and resumes where it left off.

import { createRateLimiter } from './rateLimiter.js';

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_BACKOFFS = 6;
const LOG_LIMIT = 200;

export function newJob(platform) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    platform,
    status: 'idle', // idle | connected | scanning | ready | running | paused | done | error
    user: null,
    userId: null,
    error: null,
    range: null,
    types: [],
    scanned: 0,
    queue: [],
    cursor: 0,
    deleted: 0,
    failed: [],
    options: {},
    log: [],
    startedAt: null,
    finishedAt: null,
  };
}

export function createJobManager({ store, adapter, platforms, sleep, now = Date.now }) {
  let running = false;

  async function update(patch) {
    const job = { ...(await store.getJob()), ...patch };
    await store.setJob(job);
    return job;
  }

  async function log(job, message) {
    const entry = { at: now(), message };
    return update({ log: [...(job.log || []), entry].slice(-LOG_LIMIT) });
  }

  async function checkLogin(platform) {
    await store.setJob({ ...newJob(platform), status: 'idle' });
    try {
      const res = await adapter.call(platform, 'checkLogin');
      if (!res.loggedIn) {
        return update({ error: `You're not logged in to ${platforms[platform].name} in this browser. Log in, then try again.` });
      }
      return update({ status: 'connected', user: res.username, userId: res.userId || null });
    } catch (e) {
      return update({ status: 'idle', error: e.message });
    }
  }

  async function scan({ range, types }) {
    let job = await update({ status: 'scanning', range, types, scanned: 0, error: null });
    const { platform } = job;
    const posts = [];
    const seen = new Set();
    let cursor = null;
    try {
      do {
        const page = await adapter.call(platform, 'listPage', { cursor, range, types });
        for (const p of page.posts) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            posts.push(p);
          }
        }
        cursor = page.nextCursor;
        await update({ scanned: posts.length });
        if (cursor) await sleep(platforms[platform].limits.scanDelayMs);
      } while (cursor);
      await store.setPosts(platform, posts);
      job = await update({ status: 'ready', scanned: posts.length });
      return log(job, `Scan found ${posts.length} items.`);
    } catch (e) {
      // Keep whatever we found so far; the user can still review it.
      await store.setPosts(platform, posts);
      return update({ status: 'connected', error: `Scan stopped: ${e.message}` });
    }
  }

  // For platforms whose posts come from a downloaded data archive.
  async function importPosts({ posts, source }) {
    let job = await store.getJob();
    if (source?.accountId && job.userId && source.accountId !== job.userId) {
      const who = source.username ? `@${source.username}` : 'another account';
      return update({ error: `This archive belongs to ${who}, not the account logged in here (${job.user}).` });
    }
    await store.setPosts(job.platform, posts);
    job = await update({
      status: 'ready',
      scanned: posts.length,
      range: null,
      types: [...new Set(posts.map((p) => p.type))],
      error: null,
    });
    return log(job, `Imported ${posts.length} items from your archive.`);
  }

  async function start({ ids, options }) {
    const job = await update({
      status: 'running',
      queue: ids,
      cursor: 0,
      deleted: 0,
      failed: [],
      options: options || {},
      error: null,
      startedAt: now(),
      finishedAt: null,
    });
    await log(job, `Started deleting ${ids.length} items.`);
    return run();
  }

  // The run loop re-reads the job before each item, so pausing or resetting
  // is just a status change.
  async function pause() {
    const job = await update({ status: 'paused' });
    return log(job, 'Paused.');
  }

  async function resume() {
    await update({ status: 'running', error: null });
    return run();
  }

  // Starting over or switching account wipes the saved list of posts, so no
  // copy of anyone's posts lingers in the browser after they're done with it.
  async function reset() {
    const job = await store.getJob();
    if (job?.platform) await store.setPosts(job.platform, []);
    await store.setJob({ ...newJob(job?.platform || 'reddit'), status: job?.user ? 'connected' : 'idle', user: job?.user || null, userId: job?.userId || null });
  }

  // Back to choosing a platform.
  async function disconnect() {
    const job = await store.getJob();
    if (job?.platform) await store.setPosts(job.platform, []);
    await store.setJob(newJob(job?.platform || 'reddit'));
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      let job = await store.getJob();
      if (!job || job.status !== 'running') return;
      const jobId = job.id;
      // Stop if the user paused or reset while we were waiting.
      const stillRunning = async () => {
        const current = await store.getJob();
        return current?.id === jobId && current.status === 'running';
      };
      const posts = new Map((await store.getPosts(job.platform)).map((p) => [p.id, p]));
      const limiter = createRateLimiter(platforms[job.platform].limits, { sleep, now });
      let consecutiveFailures = 0;

      while (job.cursor < job.queue.length) {
        await limiter.wait();
        if (!(await stillRunning())) return;

        const id = job.queue[job.cursor];
        const post = posts.get(id);
        try {
          if (!post) throw new Error('Item missing from scan results');
          const res = await adapter.call(job.platform, 'deletePost', { post, options: job.options });
          if (res.rateLimited) {
            const level = await limiter.backoff();
            if (level > MAX_BACKOFFS) {
              job = await update({ status: 'paused', error: 'The site keeps rate-limiting us. Paused — try resuming later.' });
              return;
            }
            job = await log(job, `Rate limited, slowing down (level ${level}).`);
            continue; // retry the same item
          }
          if (!res.ok) throw new Error(res.error || 'Unknown error');
          // Record the deletion even if the user paused meanwhile, but not after a reset.
          if ((await store.getJob())?.id !== jobId) return;
          limiter.success();
          consecutiveFailures = 0;
          job = await update({ cursor: job.cursor + 1, deleted: job.deleted + 1 });
        } catch (e) {
          if ((await store.getJob())?.id !== jobId) return;
          consecutiveFailures++;
          job = await update({ cursor: job.cursor + 1, failed: [...job.failed, { id, error: e.message }] });
          job = await log(job, `Failed ${id}: ${e.message}`);
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            job = await update({ status: 'paused', error: `Paused after ${consecutiveFailures} failures in a row. Last error: ${e.message}` });
            return;
          }
        }
      }

      job = await update({ status: 'done', finishedAt: now() });
      await log(job, `Done. Deleted ${job.deleted}, failed ${job.failed.length}.`);
    } finally {
      running = false;
    }
  }

  return { checkLogin, scan, importPosts, start, pause, resume, reset, disconnect, run, get running() { return running; } };
}
