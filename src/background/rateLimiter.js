// Pacing that respects each site's limits: a fixed delay between actions,
// an hourly cap, and exponential backoff whenever the site says to slow down.

const HOUR_MS = 60 * 60 * 1000;
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 15 * 60 * 1000;

export function createRateLimiter(limits, { sleep, now = Date.now }) {
  const { delayMs, maxPerHour } = limits;
  const stamps = [];
  let backoffLevel = 0;

  return {
    async wait() {
      const t = now();
      while (stamps.length && t - stamps[0] >= HOUR_MS) stamps.shift();
      if (stamps.length >= maxPerHour) await sleep(stamps[0] + HOUR_MS - t);
      await sleep(delayMs);
      stamps.push(now());
    },
    // Returns the new backoff level so callers can give up after too many.
    async backoff() {
      backoffLevel++;
      await sleep(Math.min(BACKOFF_BASE_MS * 2 ** (backoffLevel - 1), BACKOFF_MAX_MS));
      return backoffLevel;
    },
    success() {
      backoffLevel = 0;
    },
  };
}
