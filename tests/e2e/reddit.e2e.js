// Reddit end-to-end test against a fake reddit.com (no real account touched).

import assert from 'node:assert/strict';
import path from 'node:path';
import { runE2E, json, deleteAndWait, pickDates, waitForCount, RESULTS } from './harness.js';

const MODHASH = 'mh-test-123';
const ts = (s) => Date.parse(`${s}T12:00:00Z`) / 1000;

const fake = {
  submitted: [
    { kind: 't3', data: { name: 't3_new', title: 'Recent post', selftext: 'hi', is_self: true, created_utc: ts('2024-05-01'), permalink: '/r/pics/1', subreddit: 'pics', score: 3, num_comments: 0 } },
    { kind: 't3', data: { name: 't3_old1', title: 'Old self post', selftext: 'old text', is_self: true, created_utc: ts('2017-03-01'), permalink: '/r/pics/2', subreddit: 'pics', score: 5, num_comments: 1 } },
    { kind: 't3', data: { name: 't3_popular', title: 'Popular link', selftext: '', is_self: false, url: 'https://example.com/x.jpg', created_utc: ts('2016-07-01'), permalink: '/r/pics/3', subreddit: 'pics', score: 900, num_comments: 40 } },
    { kind: 't3', data: { name: 't3_old2', title: 'Old link', selftext: '', is_self: false, url: 'https://example.com', created_utc: ts('2015-02-01'), permalink: '/r/news/4', subreddit: 'news', score: 2, num_comments: 0 } },
    { kind: 't3', data: { name: 't3_ancient', title: 'Too old', selftext: '', is_self: true, created_utc: ts('2012-01-01'), permalink: '/r/news/5', subreddit: 'news', score: 1, num_comments: 0 } },
  ],
  comments: [
    { kind: 't1', data: { name: 't1_c1', body: 'old comment', link_title: 'Thread', created_utc: ts('2016-01-01'), permalink: '/r/x/c1', subreddit: 'x', score: 1 } },
    { kind: 't1', data: { name: 't1_keepme', body: 'my wedding story', link_title: 'Thread', created_utc: ts('2016-02-01'), permalink: '/r/x/c2', subreddit: 'x', score: 1 } },
  ],
};
let signedIn = false; // starts signed out to exercise the sign-in help screen
const deleted = [];
const edited = [];

async function fakeReddit(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  if (p === '/' || p === '') return route.fulfill({ contentType: 'text/html', body: '<html><body>fake reddit</body></html>' });
  if (p === '/api/me.json') return json(route, signedIn ? { kind: 't2', data: { name: 'testuser', modhash: MODHASH } } : {});

  const listing = p.match(/^\/user\/testuser\/(submitted|comments)\.json$/);
  if (listing) {
    const all = fake[listing[1]];
    const start = url.searchParams.get('after') ? all.findIndex((c) => c.data.name === url.searchParams.get('after')) + 1 : 0;
    const page = all.slice(start, start + 2); // 2 per page to exercise pagination
    const after = start + 2 < all.length ? page.at(-1).data.name : null;
    return json(route, { kind: 'Listing', data: { children: page, after } });
  }

  if (req.method() === 'POST' && (p === '/api/del' || p === '/api/editusertext')) {
    const form = new URLSearchParams(req.postData());
    if (form.get('uh') !== MODHASH || req.headers()['x-modhash'] !== MODHASH) return json(route, {}, 403);
    if (p === '/api/del') deleted.push(form.get('id'));
    else edited.push(form.get('thing_id'));
    return json(route, {});
  }
  return route.fulfill({ status: 404, body: 'not found' });
}

await runE2E(
  'Reddit',
  { routes: [[/^https?:\/\/([a-z]+\.)?reddit\.com\//, fakeReddit]], openFirst: ['https://old.reddit.com/'] },
  async ({ panel }) => {
    // 1. Connect
    await panel.screenshot({ path: path.join(RESULTS, 'choose.png'), fullPage: true });
    await panel.getByRole('button', { name: /Reddit/ }).click();
    await panel.getByRole('heading', { name: 'Sign in to Reddit first' }).waitFor({ timeout: 20000 });
    await panel.screenshot({ path: path.join(RESULTS, 'signin-help.png'), fullPage: true });
    console.log('✓ signed-out user sees sign-in help');
    signedIn = true;
    await panel.getByRole('button', { name: 'Try again' }).click();
    await panel.getByText('Signed in as').waitFor({ timeout: 20000 });
    await panel.getByText('testuser').waitFor();
    console.log('✓ signed in as testuser after "Try again"');

    // 2. Scan 2015–2018
    await pickDates(panel, '2015-01-01', '2018-12-31');
    await panel.screenshot({ path: path.join(RESULTS, 'find.png'), fullPage: true });
    await panel.getByRole('button', { name: 'Find my posts' }).click();
    await panel.getByRole('heading', { name: 'Review your posts' }).waitFor({ timeout: 30000 });
    console.log('✓ scan complete');

    // 3. Review: date range excludes 2024 + 2012 posts → 5 candidates
    await waitForCount(panel, '5 of 7 selected');
    // keep popular posts and anything mentioning "wedding"
    await panel.getByText('Keep some posts safe').click();
    await panel.fill('#keepMinScore', '100');
    await panel.fill('#keepKeywords', 'wedding');
    await waitForCount(panel, '3 of 7');
    // manually keep one more
    await panel.locator('input[data-id="t3_old2"]').uncheck();
    await waitForCount(panel, '2 of 7');
    console.log('✓ filters + manual selection work');
    await panel.screenshot({ path: path.join(RESULTS, 'reddit-review.png'), fullPage: true });

    // 4. Delete
    const downloads = await deleteAndWait(panel, 90000, { screenshots: true });
    assert.deepEqual([...deleted].sort(), ['t1_c1', 't3_old1']);
    assert.deepEqual([...edited].sort(), ['t1_c1', 't3_old1']);
    assert.equal(downloads.length, 2);
    assert.ok(downloads.some((f) => f.endsWith('.json')) && downloads.some((f) => f.endsWith('.html')));
    assert.ok(await panel.getByText('items deleted from Reddit').isVisible());
    await panel.screenshot({ path: path.join(RESULTS, 'done.png'), fullPage: true });
    console.log('✓ deleted', deleted, '| overwritten', edited, '| backups', downloads);
  },
);
