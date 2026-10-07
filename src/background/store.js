// Thin wrapper over chrome.storage.local. The job object is the single source
// of truth the side panel renders from (it listens to storage.onChanged).

export const chromeStore = {
  async getJob() {
    const { job } = await chrome.storage.local.get('job');
    return job || null;
  },
  async setJob(job) {
    await chrome.storage.local.set({ job });
  },
  async getPosts(platform) {
    const key = `posts:${platform}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  },
  async setPosts(platform, posts) {
    await chrome.storage.local.set({ [`posts:${platform}`]: posts });
  },
  // Erases everything the extension has stored in this browser.
  async clearAll() {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
  },
};

export function createMemoryStore() {
  const data = { job: null, posts: {} };
  return {
    data,
    async getJob() {
      return data.job && structuredClone(data.job);
    },
    async setJob(job) {
      data.job = structuredClone(job);
    },
    async getPosts(platform) {
      return structuredClone(data.posts[platform] || []);
    },
    async setPosts(platform, posts) {
      data.posts[platform] = structuredClone(posts);
    },
    async clearAll() {
      data.job = null;
      data.posts = {};
    },
  };
}
