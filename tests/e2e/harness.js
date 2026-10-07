// Shared setup for end-to-end tests: launches Chromium with the extension
// loaded, intercepts the given sites with fakes, and opens the side panel.

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const RESULTS = path.join(EXT, 'test-results');

export const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * @param {object} opts
 * @param {[RegExp, Function][]} opts.routes  url pattern → Playwright route handler
 * @param {object[]} [opts.cookies]
 * @param {string[]} [opts.openFirst]          site tabs to open before the panel (a user with the site open)
 */
export async function runE2E(name, { routes, cookies = [], openFirst = [] }, body) {
  mkdirSync(RESULTS, { recursive: true });
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    acceptDownloads: true,
    colorScheme: process.env.COLOR_SCHEME || 'light',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const errors = [];
  try {
    for (const [pattern, handler] of routes) await context.route(pattern, handler);
    if (cookies.length) await context.addCookies(cookies);

    let [worker] = context.serviceWorkers();
    worker ||= await context.waitForEvent('serviceworker');
    const extId = new URL(worker.url()).host;
    worker.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
      if (process.env.DEBUG) console.log('[worker]', m.text());
    });
    context.on('page', (pg) => process.env.DEBUG && console.log('[new tab]', pg.url()));

    // Playwright can't intercept a tab the extension opens itself early
    // enough, so tests start with the site already open in a tab.
    for (const url of openFirst) await (await context.newPage()).goto(url);

    const panel = await context.newPage();
    panel.on('pageerror', (e) => errors.push(e.message));
    panel.on('dialog', (d) => d.accept());
    await panel.setViewportSize({ width: 400, height: 900 });
    await panel.goto(`chrome-extension://${extId}/src/sidepanel/index.html`);

    await body({ context, panel, errors });
    if (errors.length) throw new Error(`Console errors:\n${errors.join('\n')}`);
    console.log(`\n${name} E2E PASSED\n`);
  } catch (e) {
    const panel = context.pages().find((pg) => pg.url().startsWith('chrome-extension://'));
    if (panel) console.error('--- panel text ---\n' + (await panel.innerText('body').catch(() => '')));
    process.exitCode = 1;
    throw e;
  } finally {
    await context.close();
  }
}

// Picks a platform card and waits until signed in.
export async function signIn(panel, name, expectedUser) {
  await panel.getByRole('button', { name }).click();
  await panel.getByText('Signed in as').waitFor({ timeout: 20000 });
  await panel.getByText(expectedUser).waitFor();
}

export async function pickDates(panel, from, to) {
  await panel.getByText('Pick exact dates…').click();
  await panel.fill('#from', from);
  await panel.fill('#to', to);
}

export const waitForCount = (panel, text) => panel.locator('#count', { hasText: text }).waitFor();

// Continue → tick "I understand" → Delete, then wait for the job to finish.
export async function deleteAndWait(panel, timeout = 90000, { screenshots = false } = {}) {
  const downloads = [];
  downloads.files = [];
  panel.on('download', (d) => {
    downloads.push(d.suggestedFilename());
    downloads.files.push(d);
  });
  await panel.getByRole('button', { name: 'Continue' }).click();
  const deleteButton = panel.getByRole('button', { name: /^Delete \d/ });
  if (await deleteButton.isEnabled()) throw new Error('Delete must stay disabled until "I understand" is ticked');
  await panel.getByLabel(/I understand/).check();
  if (screenshots) await panel.screenshot({ path: path.join(RESULTS, 'confirm.png'), fullPage: true });
  await deleteButton.click();
  if (screenshots) {
    await panel.getByRole('heading', { name: 'Cleaning up…' }).waitFor();
    await panel.screenshot({ path: path.join(RESULTS, 'progress.png'), fullPage: true });
  }
  await panel.getByRole('heading', { name: /All clean!|Finished/ }).waitFor({ timeout });
  return downloads;
}
