// Runs inside the social site's tab. Picks the adapter for this site and
// answers method calls from the background worker.

(() => {
  if (globalThis.__socialCleanupListening) return;
  globalThis.__socialCleanupListening = true;

  const adapter = (globalThis.__socialCleanupAdapters || []).find((a) => a.matchesHost(location.hostname));
  const METHODS = ['checkLogin', 'listPage', 'deletePost'];

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.target !== 'adapter') return;

    if (msg.method === 'ping') {
      sendResponse({ result: { platform: adapter?.id ?? null } });
      return;
    }
    if (!adapter || !METHODS.includes(msg.method)) {
      sendResponse({ error: `Unsupported call: ${msg.method}` });
      return;
    }
    Promise.resolve()
      .then(() => adapter[msg.method](msg.args || {}))
      .then(
        (result) => sendResponse({ result }),
        (err) => sendResponse({ error: String(err?.message || err) }),
      );
    return true; // keep the channel open for the async response
  });
})();
