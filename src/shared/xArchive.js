// Turns an X/Twitter data archive ("Download an archive of your data") into
// posts. Accepts the archive .zip itself, or the files from its data/ folder.

import { listZip, readZipEntryText } from './zip.js';

const TWITTER_EPOCH = 1288834974657n;
const WANTED = /(^|\/)data\/(account|tweets?(-part\d+)?|like(-part\d+)?)\.js$|^(account|tweets?(-part\d+)?|like(-part\d+)?)\.js$/;

// Tweet IDs encode their creation time.
export function snowflakeToMs(id) {
  try {
    return Number((BigInt(id) >> 22n) + TWITTER_EPOCH);
  } catch {
    return 0;
  }
}

// Archive files look like: window.YTD.tweets.part0 = [ ... ]
export function parseYtd(text) {
  const start = text.indexOf('=');
  if (start < 0) throw new Error('Unrecognized archive file');
  return JSON.parse(text.slice(start + 1).trim().replace(/;$/, ''));
}

const baseName = (name) => name.split('/').pop();

export function parseArchiveFiles(files) {
  let account = null;
  const tweets = [];
  const likes = [];
  for (const { name, text } of files) {
    const base = baseName(name);
    const rows = parseYtd(text);
    if (base === 'account.js') account = rows[0]?.account || null;
    else if (base.startsWith('like')) likes.push(...rows.map((r) => r.like || r));
    else tweets.push(...rows.map((r) => r.tweet || r));
  }
  if (!tweets.length && !likes.length) throw new Error('No posts or likes found. Pick the X archive .zip (or its data folder).');

  const username = account?.username || 'i';
  const posts = [];
  for (const t of tweets) {
    const id = t.id_str || t.id;
    const text = t.full_text || t.text || '';
    const parsed = Date.parse(t.created_at);
    const media = (t.extended_entities?.media || t.entities?.media || []).map((m) => m.media_url_https).filter(Boolean);
    posts.push({
      id,
      type: text.startsWith('RT @') ? 'repost' : t.in_reply_to_status_id_str ? 'reply' : 'post',
      createdAt: Number.isFinite(parsed) ? parsed : snowflakeToMs(id),
      title: '',
      text,
      url: `https://x.com/${username}/status/${id}`,
      mediaUrls: [...new Set(media)],
      community: null,
      engagement: { score: Number(t.favorite_count) || 0, reposts: Number(t.retweet_count) || 0 },
    });
  }
  for (const l of likes) {
    if (!l.tweetId) continue;
    posts.push({
      id: `like:${l.tweetId}`,
      tweetId: l.tweetId,
      type: 'like',
      // The archive doesn't record when you liked something, so this is the
      // date of the liked post itself.
      createdAt: snowflakeToMs(l.tweetId),
      title: '',
      text: l.fullText || '',
      url: l.expandedUrl || `https://x.com/i/status/${l.tweetId}`,
      mediaUrls: [],
      community: null,
      engagement: { score: 0 },
    });
  }
  return { posts, accountId: account?.accountId || null, username: account?.username || null };
}

/** @param {File[]} fileList  the archive .zip, or the .js files from its data folder */
export async function readXArchive(fileList) {
  const files = [];
  for (const file of fileList) {
    if (/\.zip$/i.test(file.name)) {
      const entries = (await listZip(file)).filter((e) => WANTED.test(e.name));
      for (const entry of entries) files.push({ name: entry.name, text: await readZipEntryText(file, entry) });
    } else if (WANTED.test(file.webkitRelativePath || file.name) || WANTED.test(file.name)) {
      files.push({ name: file.name, text: await file.text() });
    }
  }
  return parseArchiveFiles(files);
}
