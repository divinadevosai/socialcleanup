// Builds the backup files saved before anything is deleted.

import { safeUrl } from './security.js';

export function buildBackupJson(posts, meta) {
  return JSON.stringify(
    {
      exportedAt: new Date(meta.exportedAt).toISOString(),
      platform: meta.platform,
      user: meta.user,
      count: posts.length,
      posts: posts.map((p) => ({ ...p, createdAt: p.createdAt == null ? null : new Date(p.createdAt).toISOString() })),
    },
    null,
    2,
  );
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildBackupHtml(posts, meta) {
  const items = [...posts]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map((p) => {
      const date = p.createdAt == null ? null : new Date(p.createdAt).toLocaleString();
      const title = p.title ? `<h3>${escapeHtml(p.title)}</h3>` : '';
      const media = (p.mediaUrls || [])
        .map((u) => (safeUrl(u) ? `<a href="${escapeHtml(safeUrl(u))}">${escapeHtml(u)}</a>` : escapeHtml(u)))
        .join('<br>');
      return `<article>
  <div class="meta">${escapeHtml(p.type)} · ${p.community ? `${escapeHtml((meta.communityPrefix || '') + p.community)} · ` : ''}${escapeHtml(date || 'unknown date')}${p.engagement?.score != null ? ` · score ${escapeHtml(p.engagement.score)}` : ''}</div>
  ${title}
  <p>${escapeHtml(p.text).replace(/\n/g, '<br>')}</p>
  ${media ? `<p>${media}</p>` : ''}
  ${safeUrl(p.url) ? `<a class="link" href="${escapeHtml(safeUrl(p.url))}">${escapeHtml(p.url)}</a>` : `<span class="link">${escapeHtml(p.url)}</span>`}
</article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.platform)} backup</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 16px;color:#1d1d1f;background:#fff}
article{border-bottom:1px solid #ddd;padding:1rem 0}
h3{margin:.25rem 0}.meta{color:#666;font-size:13px}.link{font-size:12px;color:#06c;word-break:break-all}
</style></head><body>
<h1>${escapeHtml(meta.platform)} backup for ${escapeHtml(meta.user)}</h1>
<p>${posts.length} items · exported ${escapeHtml(new Date(meta.exportedAt).toLocaleString())}</p>
${items}
</body></html>`;
}
