// Decides which scanned posts are candidates for deletion. Pure functions so
// the side panel preview and the tests use exactly the same logic.

const DAY_MS = 24 * 60 * 60 * 1000;

// "2015-03-01" -> start-of-day timestamp in local time (null when empty).
export function dateInputToMs(value, { endOfDay = false } = {}) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  return endOfDay ? start + DAY_MS - 1 : start;
}

function splitList(text) {
  return (text || '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^r\//, ''))
    .filter(Boolean);
}

/**
 * @param {object[]} posts
 * @param {object} f
 * @param {number|null} f.from          oldest timestamp to delete (inclusive)
 * @param {number|null} f.to            newest timestamp to delete (inclusive)
 * @param {string[]} f.types            post types to include, e.g. ['post', 'comment']
 * @param {number|null} f.keepMinScore  keep anything with score >= this
 * @param {string} f.keepCommunities    comma-separated communities to keep
 * @param {string} f.keepKeywords       comma-separated words; matching posts are kept
 */
export function applyFilters(posts, f) {
  const types = new Set(f.types || []);
  const keepCommunities = new Set(splitList(f.keepCommunities));
  const keepKeywords = splitList(f.keepKeywords);
  const keepMinScore = Number.isFinite(f.keepMinScore) ? f.keepMinScore : null;

  return posts.filter((p) => {
    if (!types.has(p.type)) return false;
    // Items with an unknown date are only included when no date range is set.
    if ((f.from != null || f.to != null) && p.createdAt == null) return false;
    if (f.from != null && p.createdAt < f.from) return false;
    if (f.to != null && p.createdAt > f.to) return false;
    if (keepMinScore != null && (p.engagement?.score ?? 0) >= keepMinScore) return false;
    if (p.community && keepCommunities.has(p.community.toLowerCase())) return false;
    if (keepKeywords.length) {
      const haystack = `${p.title || ''} ${p.text || ''}`.toLowerCase();
      if (keepKeywords.some((k) => haystack.includes(k))) return false;
    }
    return true;
  });
}
