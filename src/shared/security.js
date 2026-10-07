// Small, pure security helpers (unit-tested in tests/security.test.js).

// Only plain web links may become clickable. Blocks javascript:, data:, etc.
export function safeUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

// Commands that change state may only come from the extension's own pages
// (the side panel). The browser stamps sender.url, and for a content script
// it is the website's address, so a script inside a site can't pass this.
export function isFromExtensionPage(sender, extensionId, extensionOrigin) {
  return Boolean(sender && sender.id === extensionId && String(sender.url || '').startsWith(extensionOrigin));
}

// Content-script requests must come from this extension, inside a tab on one
// of the given hosts.
export function isFromContentScript(sender, extensionId, hosts) {
  if (!sender || sender.id !== extensionId || !sender.tab) return false;
  try {
    return hosts.includes(new URL(sender.url || sender.tab.url).host);
  } catch {
    return false;
  }
}

// X keeps its web app's script on this host and path only.
export function isXBundleUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && u.host === 'abs.twimg.com' && u.pathname.startsWith('/responsive-web/') && u.pathname.endsWith('.js') && !u.username && !u.password;
  } catch {
    return false;
  }
}
