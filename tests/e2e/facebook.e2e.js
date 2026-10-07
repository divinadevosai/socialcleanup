// Facebook end-to-end test against a fake Activity Log page. It checks the
// clicking mechanics (scroll, menu, confirm). It can't prove the selectors
// match the real facebook.com, which changes often.

import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runE2E, RESULTS, deleteAndWait, signIn, pickDates, waitForCount } from './harness.js';

const FIXTURE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/facebook-activity.html'), 'utf8');
const ACTIVITY_URL = 'https://www.facebook.com/1000/allactivity?category_key=MANAGEPOSTS';

async function fakeFacebook(route) {
  const url = new URL(route.request().url());
  if (url.pathname === '/1000/allactivity') return route.fulfill({ contentType: 'text/html', body: FIXTURE });
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<html><body><div aria-label="Your profile"></div>News feed</body></html>' });
  return route.fulfill({ status: 404, body: 'not found' });
}

let activityPage;

await runE2E(
  'Facebook',
  {
    routes: [[/^https:\/\/www\.facebook\.com\//, fakeFacebook]],
    cookies: [{ name: 'c_user', value: '1000', domain: '.facebook.com', path: '/' }],
    // The user's tab is on the news feed: the extension must open its own
    // tab on the Activity Log rather than navigate the user's tab away.
    openFirst: ['https://www.facebook.com/'],
  },
  async ({ context, panel }) => {
    const userTab = context.pages().find((p) => p.url() === 'https://www.facebook.com/');
    // Test shim: the tab the extension opens loads before Playwright can
    // intercept it, so it shows an error page. Reload it once we're attached.
    context.on('page', async (pg) => {
      await pg.waitForLoadState().catch(() => {});
      if (pg.url().startsWith('chrome-error://')) await pg.goto(ACTIVITY_URL);
    });

    // 1. Connect
    await signIn(panel, /Facebook/, 'account 1000');
    console.log('✓ connected (c_user cookie)');

    // 2. Scan 2015–2018. The page loads in batches as it scrolls; the 2012
    // batch is older than the range, so scanning stops there.
    await pickDates(panel, '2015-01-01', '2018-12-31');
    await panel.getByRole('button', { name: 'Find my posts' }).click();
    await panel.getByRole('heading', { name: 'Review your posts' }).waitFor({ timeout: 60000 });
    await waitForCount(panel, '4 of 6 selected');
    activityPage = context.pages().find((p) => p.url().includes('/allactivity'));
    assert.ok(activityPage, 'extension opened its own Activity Log tab');
    assert.equal(userTab.url(), 'https://www.facebook.com/', "user's tab was left alone");
    console.log('✓ opened Activity Log in its own tab; your tab untouched');
    console.log('✓ scanned with infinite scroll + date headings; 2019 and 2012 excluded');

    // 3. Keep the wedding post
    await panel.getByText('Keep some posts safe').click();
    await panel.fill('#keepKeywords', 'wedding');
    await waitForCount(panel, '3 of 6');
    await panel.screenshot({ path: path.join(RESULTS, 'facebook-review.png'), fullPage: true });

    // 4. Delete via ⋯ → Move to trash → Move
    const downloads = await deleteAndWait(panel, 120000);
    const trashed = await activityPage.evaluate(() => window.__deleted);
    assert.deepEqual([...trashed].sort(), ['nolink', 'p2016', 'p2017a']);
    assert.equal(downloads.length, 2);
    assert.ok(await panel.getByText('items deleted from Facebook').isVisible());
    console.log('✓ trashed', trashed, 'by clicking through menus and the confirm dialog');
  },
);
