// Shared helpers for adapters that work by clicking through a site's UI.

(() => {
  if (globalThis.__socialCleanupDom) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Polls until fn() returns something truthy; rejects after `timeout` ms.
  async function waitFor(fn, timeout = 5000, interval = 100) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error('Timed out waiting for the page');
  }

  const isVisible = (el) => Boolean(el && el.isConnected && el.getClientRects().length);

  // First line of an element's text: menu items often add a description line.
  const firstLine = (el) => (el.innerText || el.textContent || '').trim().split('\n')[0].trim();

  function findByText(selector, pattern, root = document) {
    return [...root.querySelectorAll(selector)].filter(isVisible).find((el) => pattern.test(firstLine(el))) || null;
  }

  // Short pause after scrolling or clicking so the page can finish updating
  // (menus and dialogs animate in) before the next step looks for them.
  const settle = () => sleep(400);

  async function click(el) {
    el.scrollIntoView({ block: 'center' });
    await settle();
    el.click();
  }

  function pressEscape() {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  globalThis.__socialCleanupDom = { sleep, waitFor, isVisible, firstLine, findByText, settle, click, pressEscape };
})();
