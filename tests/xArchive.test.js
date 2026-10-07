import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listZip, readZipEntryText } from '../src/shared/zip.js';
import { parseArchiveFiles, readXArchive, snowflakeToMs } from '../src/shared/xArchive.js';
import { makeZip } from './helpers/makeZip.js';
import { ARCHIVE_FILES, MODERN_ID } from './helpers/fixtures.js';

test('snowflake IDs decode to creation time', () => {
  assert.equal(new Date(snowflakeToMs(MODERN_ID)).toISOString().slice(0, 10), '2018-10-10');
});

test('parses tweets, replies, reposts and likes', () => {
  const files = Object.entries(ARCHIVE_FILES)
    .filter(([n]) => n.endsWith('.js'))
    .map(([name, text]) => ({ name, text }));
  const { posts, accountId, username } = parseArchiveFiles(files);
  assert.equal(accountId, '42');
  assert.equal(username, 'tester');
  const byId = Object.fromEntries(posts.map((p) => [p.id, p]));
  assert.equal(byId['111'].type, 'post');
  assert.equal(byId['111'].engagement.score, 5);
  assert.equal(new Date(byId['111'].createdAt).toISOString(), '2018-10-10T20:19:24.000Z');
  assert.equal(byId['111'].url, 'https://x.com/tester/status/111');
  assert.equal(byId['222'].type, 'reply');
  assert.equal(byId['333'].type, 'repost');
  assert.deepEqual(byId['333'].mediaUrls, ['https://pbs.twimg.com/a.jpg']);
  assert.equal(byId[`like:${MODERN_ID}`].type, 'like');
  assert.equal(byId[`like:${MODERN_ID}`].tweetId, MODERN_ID);
});

for (const zip64 of [false, true]) {
  test(`reads only the needed files from a ${zip64 ? 'ZIP64' : 'regular'} archive`, async () => {
    const zip = makeZip(
      Object.entries(ARCHIVE_FILES).map(([n, t], i) => [`twitter-2026/${n}`, t, { store: i % 2 === 0 }]),
      { zip64 },
    );
    const file = new File([zip], 'twitter-archive.zip');
    const entries = await listZip(file);
    assert.equal(entries.length, 5);
    assert.equal(await readZipEntryText(file, entries[0]), ARCHIVE_FILES['data/account.js']);

    const { posts } = await readXArchive([file]);
    assert.equal(posts.length, 4);
  });
}

test('accepts loose .js files from the data folder', async () => {
  const files = ['data/tweets.js', 'data/account.js'].map((n) => new File([ARCHIVE_FILES[n]], n.split('/')[1]));
  const { posts, username } = await readXArchive(files);
  assert.equal(posts.length, 2);
  assert.equal(username, 'tester');
});

test('rejects files that are not an archive', async () => {
  await assert.rejects(readXArchive([new File(['nope'], 'photo.zip')]), /doesn't look like a \.zip/);
  await assert.rejects(readXArchive([new File(['x'], 'notes.txt')]), /No posts or likes found/);
});
