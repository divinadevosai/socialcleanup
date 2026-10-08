// Guided platforms: the panel walks through the site's own tools and opens
// its pages, without accessing the site or storing anything.

import assert from 'node:assert/strict';
import path from 'node:path';
import { runE2E, RESULTS } from './harness.js';

const stub = (route) => {
  return route.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' });
};

await runE2E('Guided', { routes: [[/^https:\/\/([a-z]+\.)*(instagram|linkedin|threads)\.com\//, stub]] }, async ({ panel }) => {
  // All six sites on the first screen; guided ones are tagged.
  for (const name of ['Reddit', 'X / Twitter', 'Facebook', 'Instagram', 'LinkedIn', 'Threads']) {
    assert.ok(await panel.getByRole('button', { name: new RegExp(name.replace('/', '\\/')) }).isVisible(), `${name} card missing`);
  }
  assert.equal(await panel.locator('.tag', { hasText: 'Guided' }).count(), 3);
  assert.equal(await panel.getByText('Coming soon').count(), 0);
  await panel.screenshot({ path: path.join(RESULTS, 'choose-all.png'), fullPage: true });
  console.log('✓ six platforms shown, three tagged Guided, no "Coming soon"');

  // Instagram guide
  await panel.getByRole('button', { name: /Instagram/ }).click();
  await panel.getByRole('heading', { name: 'Clean up Instagram' }).waitFor();
  assert.equal(await panel.locator('.gstep').count(), 5);
  await panel.getByText('0 of 5 steps done').waitFor();

  // "Open" asks Chrome to open Instagram's own page in a new tab. (The test
  // records the request; Playwright can't intercept tabs the extension opens.)
  await panel.evaluate(() => {
    window.__opened = [];
    const real = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = (props) => (window.__opened.push(props.url), real(props));
  });
  const newTab = panel.context().waitForEvent('page');
  await panel.getByRole('button', { name: /Open Your activity/ }).click();
  await (await newTab).close();
  assert.deepEqual(await panel.evaluate(() => window.__opened), ['https://www.instagram.com/your_activity/photos_and_videos/posts/']);
  await panel.bringToFront();
  console.log('✓ "Open" goes to Instagram\'s own bulk-delete page');

  // Tick every step.
  for (let i = 0; i < 5; i++) await panel.getByLabel(`Mark step ${i + 1} as done`).check();
  await panel.getByText('5 of 5 steps done').waitFor();
  await panel.getByText('All clean!').waitFor();
  await panel.screenshot({ path: path.join(RESULTS, 'guide-instagram.png'), fullPage: true });
  console.log('✓ checklist progress and completion work');

  // Nothing stored, no permission to Instagram needed.
  assert.deepEqual(await panel.evaluate(() => chrome.storage.local.get(null)), {});
  console.log('✓ guided mode stores nothing');

  // Back, then LinkedIn and Threads render too.
  await panel.getByRole('button', { name: 'Back' }).click();
  for (const name of ['LinkedIn', 'Threads']) {
    await panel.getByRole('button', { name: new RegExp(name) }).click();
    await panel.getByRole('heading', { name: `Clean up ${name}` }).waitFor();
    await panel.screenshot({ path: path.join(RESULTS, `guide-${name.toLowerCase()}.png`), fullPage: true });
    await panel.getByRole('button', { name: 'Back' }).click();
  }
  await panel.getByRole('heading', { name: 'Which account do you want to clean up?' }).waitFor();
  console.log('✓ LinkedIn and Threads guides open and return to the start');
});
