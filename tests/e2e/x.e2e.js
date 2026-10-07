// X end-to-end test: imports an archive .zip and deletes against a fake
// x.com. The fake bundle uses different API IDs and token from the built-in
// defaults, so passing proves the adapter reads them from x.com's own script.

import assert from 'node:assert/strict';
import path from 'node:path';
import { runE2E, json, deleteAndWait, signIn, waitForCount, RESULTS } from './harness.js';
import { makeZip } from '../helpers/makeZip.js';
import { ARCHIVE_FILES, MODERN_ID } from '../helpers/fixtures.js';
import { readFileSync } from 'node:fs';

// Attack payloads hidden in the archive: HTML/script injection in post text
// and a javascript: link. None of it may run or become clickable.
const EVIL_LIKE_ID = '1050118621198921729';
const ATTACK_FILES = {
  'data/tweets-part2.js': `window.YTD.tweets.part2 = ${JSON.stringify([
    { tweet: { id_str: '666', created_at: 'Fri Jun 01 10:00:00 +0000 2018', full_text: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>', favorite_count: '0' } },
  ])}`,
  'data/like-part1.js': `window.YTD.like.part1 = ${JSON.stringify([{ like: { tweetId: EVIL_LIKE_ID, fullText: '"><svg onload=window.__pwned=3>', expandedUrl: 'javascript:window.__pwned=4' } }])}`,
};

const BEARER = `AAAAAAAAAAAAAAAAAAAAAFAKE${'b'.repeat(40)}`;
const CSRF = 'csrf-test-token';
const BUNDLE_URL = 'https://abs.twimg.com/responsive-web/client-web/main.test123.js';
const BUNDLE = `window.__fake = [
  {queryId:"FakeDel123",operationName:"DeleteTweet",operationType:"mutation"},
  {queryId:"FakeUnfav456",operationName:"UnfavoriteTweet",operationType:"mutation"},
  "${BEARER}"];`;

const deleted = [];
const unliked = [];

const authorized = (req) => req.headers().authorization === `Bearer ${BEARER}` && req.headers()['x-csrf-token'] === CSRF;

async function fakeX(route) {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  if (p === '/home') {
    return route.fulfill({ contentType: 'text/html', body: `<html><body>fake x<script src="${BUNDLE_URL}"></script></body></html>` });
  }
  if (p === '/i/api/1.1/account/settings.json') {
    return authorized(req) ? json(route, { screen_name: 'tester' }) : json(route, {}, 401);
  }
  const op = p.match(/^\/i\/api\/graphql\/([\w-]+)\/(\w+)$/);
  if (op && req.method() === 'POST') {
    if (!authorized(req)) return json(route, {}, 403);
    const [, queryId, name] = op;
    const { variables } = JSON.parse(req.postData());
    if (name === 'DeleteTweet' && queryId === 'FakeDel123') {
      deleted.push(variables.tweet_id);
      // Tweet 222 was already deleted: X reports "No status found".
      if (variables.tweet_id === '222') return json(route, { errors: [{ code: 144, message: 'No status found with that ID.' }] });
      return json(route, { data: { delete_tweet: { tweet_results: {} } } });
    }
    if (name === 'UnfavoriteTweet' && queryId === 'FakeUnfav456') {
      unliked.push(variables.tweet_id);
      return json(route, { data: { unfavorite_tweet: 'Done' } });
    }
    return json(route, { errors: [{ message: 'unknown query' }] }, 404);
  }
  return route.fulfill({ status: 404, body: 'not found' });
}

const fakeBundle = (route) =>
  route.fulfill({ contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: BUNDLE });

await runE2E(
  'X',
  {
    routes: [
      [/^https:\/\/x\.com\//, fakeX],
      [/^https:\/\/abs\.twimg\.com\//, fakeBundle],
    ],
    cookies: [
      { name: 'ct0', value: CSRF, domain: '.x.com', path: '/' },
      { name: 'twid', value: 'u%3D42', domain: '.x.com', path: '/' },
    ],
    openFirst: ['https://x.com/home'],
  },
  async ({ panel, context }) => {
    // 1. Connect
    await signIn(panel, /X \/ Twitter/, '@tester');
    console.log('✓ connected as @tester (token + csrf read correctly)');

    // 2. Import the archive .zip (with a media file that must be skipped)
    await panel.getByRole('heading', { name: 'Add your X / Twitter archive' }).waitFor();
    await panel.screenshot({ path: path.join(RESULTS, 'x-archive.png'), fullPage: true });
    const zip = makeZip(Object.entries({ ...ARCHIVE_FILES, ...ATTACK_FILES }).map(([n, t]) => [`twitter-2026/${n}`, t]));
    await panel.setInputFiles('#archive', { name: 'twitter-archive.zip', mimeType: 'application/zip', buffer: zip });
    await panel.getByRole('heading', { name: 'Review your posts' }).waitFor({ timeout: 20000 });
    await waitForCount(panel, '6 of 6 selected');
    console.log('✓ archive imported: 6 items (4 normal + 2 attack payloads)');

    // Pen test: injected markup must show as plain text and never run.
    assert.equal(await panel.locator('.list img, .list svg, .list script').count(), 0, 'injected elements rendered');
    assert.equal(await panel.evaluate(() => window.__pwned), undefined, 'injected script ran in the panel');
    assert.equal(await panel.locator('a[href^="javascript:" i]').count(), 0, 'javascript: link rendered');
    assert.ok(await panel.getByText('<img src=x onerror').isVisible(), 'payload should display as harmless text');
    // Websites must not be able to reach the extension at all.
    const xTab = context.pages().find((p) => p.url().startsWith('https://x.com/'));
    assert.equal(await xTab.evaluate(() => typeof globalThis.chrome?.runtime?.sendMessage), 'undefined', 'x.com page can message the extension');
    console.log('✓ pen test: injected HTML/scripts inert, javascript: links blocked, page cannot message extension');

    // 3. Review: keep reposts by unticking the type
    await panel.getByLabel('Reposts').uncheck();
    await waitForCount(panel, '5 of 6');
    assert.ok(await panel.getByText(/liked post from/).first().isVisible());
    console.log('✓ type filter works');
    await panel.screenshot({ path: path.join(RESULTS, 'x-review.png'), fullPage: true });

    // 4. Delete
    const downloads = await deleteAndWait(panel);
    assert.deepEqual([...deleted].sort(), ['111', '222', '666']);
    assert.deepEqual([...unliked].sort(), [MODERN_ID, EVIL_LIKE_ID].sort());
    const backupHtml = readFileSync(await downloads.files.find((d) => d.suggestedFilename().endsWith('.html')).path(), 'utf8');
    assert.ok(!/<img src=x|<script>window|<svg onload/i.test(backupHtml), 'payload not escaped in backup');
    assert.ok(!/href="javascript:/i.test(backupHtml), 'javascript: link in backup');
    console.log('✓ backup file escapes payloads and has no javascript: links');
    assert.equal(downloads.length, 2);
    assert.ok(await panel.getByText('items deleted from X / Twitter').isVisible());
    console.log('✓ deleted', deleted, '| unliked', unliked, '| already-gone tweet counted as done');
  },
);
