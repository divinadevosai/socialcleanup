import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GUIDES } from '../src/shared/guides.js';
import { PLATFORMS } from '../src/shared/platforms.js';
import { safeUrl } from '../src/shared/security.js';

test('every guided platform is complete and only links to its own https pages', () => {
  const allowedHosts = {
    instagram: ['www.instagram.com', 'accountscenter.instagram.com'],
    linkedin: ['www.linkedin.com'],
    threads: ['www.threads.com', 'accountscenter.instagram.com'],
  };
  assert.deepEqual(Object.keys(GUIDES).sort(), ['instagram', 'linkedin', 'threads']);
  for (const g of Object.values(GUIDES)) {
    assert.ok(g.name && g.blurb && g.why && g.tip && g.tile?.letter && /^#[0-9a-f]{6}$/i.test(g.tile.color), `${g.id} incomplete`);
    assert.ok(g.steps.length >= 3, `${g.id} needs steps`);
    for (const s of g.steps) {
      assert.ok(s.title && s.text, `${g.id} step missing text`);
      if (s.url) {
        assert.equal(safeUrl(s.url), s.url, `${s.url} must be a plain https link`);
        assert.equal(new URL(s.url).protocol, 'https:');
        assert.ok(allowedHosts[g.id].includes(new URL(s.url).host), `${s.url} is not ${g.name}'s own site`);
        assert.ok(s.open, `${g.id} step with a link needs a button label`);
      }
    }
  }
});

test('guided platforms are never treated as automatic ones', () => {
  for (const id of Object.keys(GUIDES)) assert.equal(PLATFORMS[id], undefined, `${id} must not be automated`);
});
