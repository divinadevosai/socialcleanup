import { PLATFORMS, COMING_SOON } from '../shared/platforms.js';
import { applyFilters, dateInputToMs } from '../shared/filters.js';
import { buildBackupHtml, buildBackupJson, escapeHtml } from '../shared/backup.js';
import { readXArchive } from '../shared/xArchive.js';
import { safeUrl } from '../shared/security.js';
import { GUIDES } from '../shared/guides.js';

const ARCHIVE_READERS = { x: readXArchive };
const PAGE_SIZE = 200;
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const app = document.getElementById('app');
const stepper = document.getElementById('stepper');

let job = null;
let posts = [];
let lastStatus = null;
const ui = {
  platform: 'reddit',
  checking: false,
  preset: 'year1',
  from: '',
  to: '',
  types: ['post', 'comment'],
  keepMinScore: '',
  keepCommunities: '',
  keepKeywords: '',
  overwrite: true,
  keepIds: new Set(),
  shown: PAGE_SIZE,
  confirming: false,
  understood: false,
  confirmStop: false,
  confirmClear: false,
  cleared: false,
  guide: null, // id of the guided platform being shown
  guideDone: new Set(),
  importStatus: '',
};

const send = (type, extra = {}) => chrome.runtime.sendMessage({ type, platform: ui.platform, ...extra });
const cfg = () => PLATFORMS[job?.platform || ui.platform];
const plural = (n, word, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`;
const fmtDate = (ms) => (ms == null ? 'Unknown date' : new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
const toDateInput = (ms) => {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const html = (strings, ...values) => strings.reduce((out, s, i) => out + s + (i < values.length ? values[i] : ''), '');

function fmtDuration(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `about ${plural(min, 'minute')}`;
  const hours = Math.round(min / 6) / 10;
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
}
const perItemMs = (c) => c.limits.delayMs;

// ---------- icons ----------

const ICON = {
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5z" /></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>',
};

const tile = (t, size = '') => `<span class="tile ${size}" style="--tile:${t.color}" aria-hidden="true">${escapeHtml(t.letter)}</span>`;

// ---------- friendly errors ----------

function friendlyError(message) {
  const name = cfg().name;
  const rules = [
    [/not logged in|logged out|still logged in/i, `You're not signed in to ${name}`, `Sign in to ${name} in a normal browser tab, then press Try again.`],
    [/couldn't connect|no response from page|receiving end/i, `We couldn't reach ${name}`, `Reload your ${name} tab (or close it so we can open a fresh one), then try again.`],
    [/rate.?limit|temporarily blocked|slow/i, `${name} asked us to slow down`, 'Wait 15 to 30 minutes, then press Resume. Nothing is lost.'],
    [/belongs to/i, 'That archive is for a different account', message],
    [/failures in a row/i, 'Paused because things kept going wrong', `Check you're still signed in to ${name}, then press Resume.`],
    [/no delete option|didn't open|didn't confirm|changed its/i, `${name} may have changed its website`, 'This tool may need an update. Check the project page for a newer version.'],
  ];
  for (const [re, title, tip] of rules) if (re.test(message)) return { title, tip, detail: message };
  return { title: 'Something went wrong', tip: 'Try again in a moment.', detail: message };
}

function errorBox() {
  if (!job?.error) return '';
  const e = friendlyError(job.error);
  return html`<div class="notice warn" role="alert">
    ${ICON.alert}
    <div><strong>${escapeHtml(e.title)}</strong><p>${escapeHtml(e.tip)}</p>
    ${e.detail !== e.tip ? `<details class="small"><summary>Technical details</summary>${escapeHtml(e.detail)}</details>` : ''}</div>
  </div>`;
}

// ---------- stepper ----------

const STEPS = ['Account', 'Find', 'Review', 'Delete'];

function currentStep() {
  const s = job?.status || 'idle';
  if (s === 'idle') return 0;
  if (s === 'connected' || s === 'scanning') return 1;
  if (s === 'ready') return ui.confirming ? 3 : 2;
  return 3;
}

function renderStepper() {
  if (ui.guide) {
    stepper.innerHTML = '';
    return;
  }
  const at = currentStep();
  stepper.innerHTML = STEPS.map(
    (label, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}" ${i === at ? 'aria-current="step"' : ''}>
      <span class="dot">${i < at ? ICON.check : i + 1}</span><span class="label">${label}</span></li>`,
  ).join('');
}

function accountBar() {
  if (!job?.user) return '';
  const c = cfg();
  return html`<div class="account">
    ${tile(c.tile, 'small')}
    <span>Signed in as <strong>${escapeHtml(job.user)}</strong></span>
    ${['running', 'paused'].includes(job.status) ? '' : '<button class="link" data-action="disconnect">Switch</button>'}
  </div>`;
}

// "Clear all my data", with an are-you-sure step.
function clearDataBlock() {
  if (ui.cleared) {
    return `<div class="notice calm" role="status">${ICON.check}<div><strong>All your data has been erased</strong><p>Nothing from Social Cleanup is stored in this browser any more.</p></div></div>`;
  }
  if (ui.confirmClear) {
    return `<div class="notice warn">${ICON.alert}<div><strong>Erase everything Social Cleanup has stored in this browser?</strong>
      <p>This removes any lists of posts, account names and progress. Backup files in your Downloads folder aren't affected.</p>
      <div class="actions"><button class="danger" data-action="clearAll">Yes, erase everything</button><button data-action="cancelClear">Cancel</button></div></div></div>`;
  }
  return '<button class="link clear-data" data-action="askClear">Clear all my data</button>';
}

// ---------- step 1: choose account ----------

function chooseView() {
  const failed = job?.error && job.status === 'idle';
  if (failed) return signInHelpView();
  const cards = Object.values(PLATFORMS)
    .map(
      (p) => `<button class="platform" data-action="pick" data-platform="${p.id}" ${ui.checking ? 'disabled' : ''}>
        ${tile(p.tile)}<span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.blurb)}</small></span>
        ${ui.checking && ui.platform === p.id ? '<span class="spinner" aria-label="Checking"></span>' : ''}
      </button>`,
    )
    .join('');
  const guided = Object.values(GUIDES)
    .map(
      (g) => `<button class="platform" data-action="guide" data-guide="${g.id}">
        ${tile(g.tile)}<span><strong>${escapeHtml(g.name)}</strong><small>${escapeHtml(g.blurb)}</small></span>
        <span class="tag">Guided</span>
      </button>`,
    )
    .join('');
  const soon = COMING_SOON.map((p) => `<div class="platform soon" aria-disabled="true">${tile(p.tile)}<span><strong>${escapeHtml(p.name)}</strong><small>Coming soon</small></span></div>`).join('');
  return html`<h2 class="title">Which account do you want to clean up?</h2>
    <p class="lead">Make sure you're signed in to it in this browser.</p>
    <div class="platforms">${cards}${guided}${soon}</div>
    <div class="notice calm">${ICON.lock}<div><strong>Private by design</strong><p>Everything happens on this computer. We never see your password or your posts, and nothing is deleted until you say so.</p></div></div>
    ${clearDataBlock()}`;
}

function signInHelpView() {
  const c = cfg();
  // The card already explains "not signed in"; only show other problems.
  const notSignedIn = /not logged in|logged out/i.test(job.error);
  return html`${notSignedIn ? '' : errorBox()}
    <div class="card stack">
      <div class="row">${tile(c.tile)}<h2 class="title">Sign in to ${escapeHtml(c.name)} first</h2></div>
      <ol class="steps">
        <li>Open ${escapeHtml(c.name)} and sign in as usual.</li>
        <li>Come back here and press <strong>Try again</strong>.</li>
      </ol>
      <div class="actions">
        <button class="primary" data-action="openSite">Open ${escapeHtml(c.name)}</button>
        <button data-action="checkLogin">Try again</button>
      </div>
      <button class="link back" data-action="disconnect">${ICON.back} Choose a different account</button>
    </div>`;
}

// ---------- guided platforms ----------

function guideView() {
  const g = GUIDES[ui.guide];
  const n = g.steps.length;
  const done = g.steps.filter((_, i) => ui.guideDone.has(i)).length;
  const steps = g.steps
    .map((s, i) => {
      const url = s.url && safeUrl(s.url);
      return `<li class="gstep ${ui.guideDone.has(i) ? 'done' : ''}">
        <label class="gcheck"><input type="checkbox" data-step="${i}" ${ui.guideDone.has(i) ? 'checked' : ''} aria-label="Mark step ${i + 1} as done"><span class="gnum">${ui.guideDone.has(i) ? ICON.check : i + 1}</span></label>
        <div class="gbody"><strong>${escapeHtml(s.title)}</strong><p>${escapeHtml(s.text)}</p>
          ${url ? `<button class="open-step" data-action="openStep" data-url="${escapeHtml(url)}">${escapeHtml(s.open || 'Open')} <span aria-hidden="true">↗</span></button>` : ''}</div>
      </li>`;
    })
    .join('');
  return html`<div class="account">
      ${tile(g.tile, 'small')}
      <span><strong>${escapeHtml(g.name)}</strong> · guided cleanup</span>
      <button class="link" data-action="leaveGuide">Back</button>
    </div>
    <h2 class="title">Clean up ${escapeHtml(g.name)}</h2>
    <p class="lead">${escapeHtml(g.why)}</p>
    <ol class="guide">${steps}</ol>
    <p class="hint" id="guideProgress" aria-live="polite">${ICON.check} ${done} of ${n} steps done</p>
    ${done === n ? `<div class="notice calm" role="status">${ICON.check}<div><strong>All clean!</strong><p>Nice work. Your ${escapeHtml(g.name)} is tidied up.</p></div></div>` : ''}
    <div class="notice tip"><div><strong>Tip</strong><p>${escapeHtml(g.tip)}</p></div></div>
    <p class="hint">${ICON.lock} Social Cleanup doesn't access ${escapeHtml(g.name)}. It only opens ${escapeHtml(g.name)} pages for you.</p>
    <button class="link back" data-action="leaveGuide">${ICON.back} Choose a different account</button>`;
}

// ---------- step 2: find posts ----------

const PRESETS = [
  { id: 'year1', label: 'Older than 1 year', years: 1 },
  { id: 'year3', label: 'Older than 3 years', years: 3 },
  { id: 'year5', label: 'Older than 5 years', years: 5 },
  { id: 'all', label: 'Everything', years: 0 },
  { id: 'custom', label: 'Pick exact dates…' },
];

function applyPreset(id) {
  ui.preset = id;
  const p = PRESETS.find((x) => x.id === id);
  if (id === 'custom') return;
  ui.from = '';
  ui.to = p.years ? toDateInput(Date.now() - p.years * YEAR_MS) : '';
}

function typeChips(types) {
  return `<fieldset class="chips"><legend>Include</legend>${types
    .map((t) => `<label class="chip"><input type="checkbox" name="type" value="${t.id}" ${ui.types.includes(t.id) ? 'checked' : ''}><span>${ICON.check}${t.label}</span></label>`)
    .join('')}</fieldset>`;
}

function dateFields() {
  return `<div class="grid2">
    <label>From<input type="date" id="from" value="${escapeHtml(ui.from)}"></label>
    <label>To<input type="date" id="to" value="${escapeHtml(ui.to)}"></label>
  </div>
  <p class="hint small-hint">Leave "From" empty to start from your very first post.</p>`;
}

function findView() {
  if (cfg().scanMode === 'archive') return archiveView();
  const presets = PRESETS.map(
    (p) => `<label class="option"><input type="radio" name="preset" value="${p.id}" ${ui.preset === p.id ? 'checked' : ''}><span>${p.label}</span></label>`,
  ).join('');
  return html`${accountBar()}${errorBox()}
    <h2 class="title">Which posts should we look for?</h2>
    <fieldset class="options"><legend class="sr-only">Time range</legend>${presets}</fieldset>
    ${ui.preset === 'custom' ? dateFields() : ''}
    ${cfg().types.length > 1 ? typeChips(cfg().types) : ''}
    <button class="primary big" data-action="scan">Find my posts</button>
    <p class="hint">${ICON.check} Nothing is deleted yet. You'll see everything first.</p>`;
}

function archiveView() {
  const c = cfg();
  return html`${accountBar()}${errorBox()}
    <h2 class="title">Add your ${escapeHtml(c.name)} archive</h2>
    <p class="lead">${escapeHtml(c.name)} only shows your newest ~3,200 posts, so the full list comes from the copy of your data it gives you.</p>
    <ol class="steps">
      <li><a href="${escapeHtml(c.archiveUrl)}" target="_blank" rel="noopener noreferrer">Request your archive</a> (Settings → Your account → Download an archive of your data).</li>
      <li>Wait for the email saying it's ready. This often takes a day or more.</li>
      <li>Download the .zip file and add it below.</li>
    </ol>
    <label class="dropzone" id="dropzone">
      ${ICON.upload}
      <strong>Drop the .zip file here</strong>
      <span>or click to choose it</span>
      <input type="file" id="archive" accept=".zip,.js" multiple class="sr-only">
    </label>
    <p class="hint" id="importStatus" role="status">${escapeHtml(ui.importStatus)}</p>
    <p class="hint">${ICON.lock} The file stays on this computer. Nothing is uploaded.</p>`;
}

function scanningView() {
  return html`${accountBar()}
    <div class="center stack">
      <span class="spinner large" aria-hidden="true"></span>
      <h2 class="title">Looking through your posts…</h2>
      <p class="huge">${job.scanned.toLocaleString()}</p>
      <p class="lead">found so far. Long histories can take a few minutes. You can keep using your browser.</p>
    </div>`;
}

// ---------- step 3: review ----------

function candidates() {
  return applyFilters(posts, {
    from: dateInputToMs(ui.from),
    to: dateInputToMs(ui.to, { endOfDay: true }),
    types: ui.types,
    keepMinScore: ui.keepMinScore === '' ? null : Number(ui.keepMinScore),
    keepCommunities: ui.keepCommunities,
    keepKeywords: ui.keepKeywords,
  });
}
const toDelete = () => candidates().filter((p) => !ui.keepIds.has(p.id));

const TYPE_NAMES = { post: 'Post', comment: 'Comment', reply: 'Reply', repost: 'Repost', like: 'Like' };

function itemHtml(p) {
  const c = cfg();
  const kept = ui.keepIds.has(p.id);
  // Reddit posts are best known by their title; elsewhere show the post text.
  const label = (c.labelFromTitle && p.title ? p.title : p.text || p.title) || '(no text)';
  const community = p.community ? ` · ${escapeHtml((c.communityPrefix || '') + p.community)}` : '';
  const date = p.type === 'like' ? `liked post from ${fmtDate(p.createdAt)}` : fmtDate(p.createdAt);
  const score = c.scoreLabel && p.type !== 'like' ? ` · ${plural(p.engagement?.score ?? 0, c.scoreLabel.replace(/s$/, ''), c.scoreLabel)}` : '';
  return `<label class="item ${kept ? 'kept' : ''}">
    <input type="checkbox" data-id="${escapeHtml(p.id)}" ${kept ? '' : 'checked'} aria-label="Delete: ${escapeHtml(label.slice(0, 80))}">
    <span class="body">
      <span class="text">${escapeHtml(label)}</span>
      <span class="meta"><span class="badge">${TYPE_NAMES[p.type] || escapeHtml(p.type)}</span>${community} · ${date}${score}
        ${safeUrl(p.url) ? `· <a href="${escapeHtml(safeUrl(p.url))}" target="_blank" rel="noopener noreferrer">view</a>` : ''}</span>
    </span>
    <span class="keeping">Keeping</span>
  </label>`;
}

// Posts selected for deletion, per year: a small bar table.
function yearChart(list) {
  const counts = new Map();
  for (const p of list) {
    if (ui.keepIds.has(p.id) || p.createdAt == null) continue;
    const y = new Date(p.createdAt).getFullYear();
    counts.set(y, (counts.get(y) || 0) + 1);
  }
  if (counts.size < 2) return '';
  const years = [...counts.keys()].sort((a, b) => b - a);
  const max = Math.max(...counts.values());
  const rows = years
    .map((y) => {
      const n = counts.get(y);
      return `<tr title="${y}: ${plural(n, 'item')} selected"><th scope="row">${y}</th>
        <td class="bar" aria-hidden="true"><i style="width:${Math.max(2, (n / max) * 100)}%"></i></td>
        <td class="num">${n.toLocaleString()}</td></tr>`;
    })
    .join('');
  return `<details class="years" open><summary>Selected by year</summary><table><caption class="sr-only">Items selected for deletion, by year</caption>${rows}</table></details>`;
}

function reviewList() {
  const list = candidates();
  const shown = list.slice(0, ui.shown).map(itemHtml).join('');
  const more = list.length > ui.shown ? `<button class="link more" data-action="more">Show ${Math.min(PAGE_SIZE, list.length - ui.shown)} more</button>` : '';
  return html`<div class="list-head">
      <span>${plural(list.length, 'match', 'matches')}</span>
      <span><button class="link" data-action="all">Select all</button> · <button class="link" data-action="none">Select none</button></span>
    </div>
    <div class="list">${shown || '<p class="empty">Nothing matches. Try a wider date range.</p>'}</div>
    ${more}`;
}

function reviewView() {
  const c = cfg();
  const present = new Set(job.types || []);
  const types = c.types.filter((t) => present.has(t.id));
  const list = candidates();
  return html`${accountBar()}${errorBox()}
    <h2 class="title">Review your posts</h2>
    <p class="lead">We found ${plural(posts.length, 'item')}. Untick anything you want to keep.</p>
    ${types.length > 1 ? typeChips(types) : ''}
    <details class="panel">
      <summary>Change dates</summary>
      ${dateFields()}
    </details>
    <details class="panel">
      <summary>Keep some posts safe</summary>
      <div class="stack">
        <label>Keep posts that mention <small>(separate words with commas)</small>
          <input type="text" id="keepKeywords" value="${escapeHtml(ui.keepKeywords)}" placeholder="e.g. wedding, graduation"></label>
        ${c.scoreLabel ? `<label>Keep posts with at least this many ${c.scoreLabel}<input type="number" min="0" id="keepMinScore" value="${escapeHtml(ui.keepMinScore)}" placeholder="e.g. 100"></label>` : ''}
        ${c.communityPrefix ? `<label>Keep posts in these communities<input type="text" id="keepCommunities" value="${escapeHtml(ui.keepCommunities)}" placeholder="e.g. AskHistorians, cooking"></label>` : ''}
      </div>
    </details>
    <div id="yearChart">${yearChart(list)}</div>
    <div id="review">${reviewList()}</div>
    <button class="link back" data-action="rescan">${c.scanMode === 'archive' ? 'Use a different archive file' : 'Search again'}</button>
    <div class="footer">
      <span id="count" aria-live="polite">${selectionText()}</span>
      <button class="primary" data-action="continue" ${toDelete().length ? '' : 'disabled'}>Continue</button>
    </div>`;
}

function selectionText() {
  const n = toDelete().length;
  return `<strong>${n.toLocaleString()}</strong> of ${posts.length.toLocaleString()} selected`;
}

// ---------- step 4: confirm, progress, done ----------

function confirmView() {
  const c = cfg();
  const n = toDelete().length;
  const thing = plural(n, 'item');
  return html`${accountBar()}
    <h2 class="title">Ready to delete ${thing}?</h2>
    <ul class="checklist">
      <li>${ICON.check}<span>A <strong>backup copy</strong> downloads to your computer first, so you'll always have your words.</span></li>
      <li>${ICON.check}<span>It takes <strong>${fmtDuration(n * perItemMs(c))}</strong>. It goes slowly on purpose to stay within ${escapeHtml(c.name)}'s limits. You can pause anytime.</span></li>
      <li>${ICON.check}<span>Keep this browser open until it finishes. You can close this panel.</span></li>
      ${c.deleteNote ? `<li>${ICON.check}<span>${escapeHtml(c.deleteNote)}</span></li>` : ''}
    </ul>
    ${c.supportsOverwrite ? `<label class="check"><input type="checkbox" id="overwrite" ${ui.overwrite ? 'checked' : ''}> <span><strong>Erase the text first</strong> (recommended). Stops copy sites from keeping your old words.</span></label>` : ''}
    <label class="check danger-zone"><input type="checkbox" id="understood" ${ui.understood ? 'checked' : ''}> <span>I understand deleted posts can't be brought back.</span></label>
    <div class="actions">
      <button class="danger big" data-action="delete" ${ui.understood ? '' : 'disabled'}>Delete ${thing}</button>
      <button data-action="back">Go back</button>
    </div>`;
}

function progressView() {
  const c = cfg();
  const total = job.queue.length || 1;
  const pct = Math.round((job.cursor / total) * 100);
  const paused = job.status === 'paused';
  const remaining = job.queue.length - job.cursor;
  const log = (job.log || [])
    .slice(-30)
    .reverse()
    .map((l) => `${new Date(l.at).toLocaleTimeString()}  ${escapeHtml(l.message)}`)
    .join('\n');
  const stop = ui.confirmStop
    ? `<div class="notice warn">${ICON.alert}<div><strong>Stop now?</strong><p>Posts already deleted stay deleted.</p>
        <div class="actions"><button class="danger" data-action="stop">Yes, stop</button><button data-action="keepGoing">Keep going</button></div></div></div>`
    : '';
  return html`${accountBar()}${errorBox()}
    <h2 class="title">${paused ? 'Paused' : 'Cleaning up…'}</h2>
    <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Progress">
      <div style="width:${pct}%"></div>
    </div>
    <p class="huge">${pct}%</p>
    <p class="lead center-text">${job.deleted.toLocaleString()} of ${job.queue.length.toLocaleString()} deleted${job.failed.length ? ` · ${job.failed.length} skipped` : ''}
      ${paused ? '' : `<br>${fmtDuration(remaining * perItemMs(c))} left`}</p>
    <p class="hint">${ICON.check} You can close this panel. Keep this browser open.</p>
    ${stop}
    <div class="actions">
      ${paused ? '<button class="primary" data-action="resume">Resume</button>' : '<button data-action="pause">Pause</button>'}
      ${ui.confirmStop ? '' : '<button data-action="askStop">Stop</button>'}
    </div>
    <details class="panel"><summary>Show details</summary><div class="log">${log}</div></details>`;
}

function doneView() {
  const failed = job.failed;
  const list = failed
    .slice(0, 50)
    .map((f) => `${escapeHtml(f.id)}: ${escapeHtml(f.error)}`)
    .join('\n');
  return html`<div class="center stack">
      <span class="big-check ${failed.length ? 'partial' : ''}">${failed.length ? ICON.alert : ICON.check}</span>
      <h2 class="title">${failed.length ? 'Finished' : 'All clean!'}</h2>
      <p class="huge">${job.deleted.toLocaleString()}</p>
      <p class="lead">${job.deleted === 1 ? 'item' : 'items'} deleted from ${escapeHtml(cfg().name)}.</p>
    </div>
    ${failed.length ? `<div class="notice warn">${ICON.alert}<div><strong>${plural(failed.length, 'item')} couldn't be deleted</strong>
      <p>Often they were already gone. You can try them again.</p>
      <details class="small"><summary>Show which</summary><div class="log">${list}</div></details></div></div>` : ''}
    <p class="hint">${ICON.lock} Your list of posts and account details have been erased from this browser${failed.length ? ' (except the items above, so you can retry them)' : ''}. Your backup is in your Downloads folder.</p>
    <div class="actions">
      ${failed.length ? '<button class="primary" data-action="retryFailed">Try those again</button>' : ''}
      <button class="${failed.length ? '' : 'primary'}" data-action="disconnect">Start again</button>
    </div>
    ${clearDataBlock()}`;
}

// ---------- rendering ----------

function render() {
  const status = job?.status || 'idle';
  const views = {
    idle: chooseView,
    connected: findView,
    scanning: scanningView,
    ready: () => (ui.confirming ? confirmView() : reviewView()),
    running: progressView,
    paused: progressView,
    done: doneView,
  };
  app.innerHTML = ui.guide && status === 'idle' ? guideView() : (views[status] || chooseView)();
  renderStepper();
  lastStatus = status;
}

// Cheap update while reviewing, so ticking boxes doesn't redraw the list.
function refreshSelection() {
  const count = document.getElementById('count');
  if (count) count.innerHTML = selectionText();
  const next = app.querySelector('[data-action="continue"]');
  if (next) next.disabled = !toDelete().length;
  const chart = document.getElementById('yearChart');
  if (chart) chart.innerHTML = yearChart(candidates());
}

function refreshReview() {
  const el = document.getElementById('review');
  if (el) el.innerHTML = reviewList();
  refreshSelection();
}

// ---------- actions ----------

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function startScan() {
  if (!ui.types.length) {
    job = { ...job, error: 'Pick at least one kind of post to include.' };
    return render();
  }
  ui.keepIds.clear();
  ui.shown = PAGE_SIZE;
  send('scan', { range: { from: dateInputToMs(ui.from), to: dateInputToMs(ui.to, { endOfDay: true }) }, types: ui.types });
}

const actions = {
  guide: (btn) => {
    if (!Object.hasOwn(GUIDES, btn.dataset.guide)) return;
    ui.cleared = false;
    ui.guide = btn.dataset.guide;
    ui.guideDone.clear();
    render();
    window.scrollTo(0, 0);
  },
  leaveGuide: () => {
    ui.guide = null;
    ui.guideDone.clear();
    render();
  },
  openStep: (btn) => {
    const url = safeUrl(btn.dataset.url);
    if (url) chrome.tabs.create({ url });
  },
  pick: (btn) => {
    ui.cleared = false;
    ui.platform = btn.dataset.platform;
    ui.types = PLATFORMS[ui.platform].types.map((t) => t.id);
    ui.checking = true;
    render();
    send('checkLogin');
  },
  checkLogin: () => {
    ui.checking = true;
    send('checkLogin');
  },
  openSite: () => chrome.tabs.create({ url: cfg().signInUrl }),
  disconnect: () => {
    ui.confirming = false;
    send('disconnect');
  },
  scan: startScan,
  rescan: () => (cfg().scanMode === 'archive' ? send('reset') : startScan()),
  more: () => {
    ui.shown += PAGE_SIZE;
    refreshReview();
  },
  all: () => {
    ui.keepIds.clear();
    refreshReview();
  },
  none: () => {
    candidates().forEach((p) => ui.keepIds.add(p.id));
    refreshReview();
  },
  continue: () => {
    if (!toDelete().length) return;
    ui.confirming = true;
    ui.understood = false;
    render();
    app.querySelector('h2')?.focus();
  },
  back: () => {
    ui.confirming = false;
    render();
  },
  delete: () => {
    const items = toDelete();
    if (!items.length || !ui.understood) return;
    const c = cfg();
    const meta = { platform: c.name, user: job.user, exportedAt: Date.now(), communityPrefix: c.communityPrefix };
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `social-cleanup-${job.platform}-${String(job.user).replace(/[^\w-]+/g, '_')}-${stamp}`;
    download(`${base}.json`, buildBackupJson(items, meta), 'application/json');
    download(`${base}.html`, buildBackupHtml(items, meta), 'text/html');
    ui.confirming = false;
    send('start', { ids: items.map((p) => p.id), options: { overwrite: ui.overwrite } });
  },
  pause: () => send('pause'),
  resume: () => send('resume'),
  askStop: () => {
    ui.confirmStop = true;
    render();
  },
  keepGoing: () => {
    ui.confirmStop = false;
    render();
  },
  stop: () => {
    ui.confirmStop = false;
    send('reset');
  },
  reset: () => send('reset'),
  askClear: () => {
    ui.confirmClear = true;
    render();
  },
  cancelClear: () => {
    ui.confirmClear = false;
    render();
  },
  clearAll: async () => {
    ui.confirmClear = false;
    ui.cleared = true;
    posts = [];
    ui.keepIds.clear();
    await send('clearAll');
    render();
  },
  retryFailed: () => send('start', { ids: job.failed.map((f) => f.id), options: job.options }),
};

app.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && !btn.disabled) actions[btn.dataset.action]?.(btn);
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.step !== undefined) {
    const i = Number(t.dataset.step);
    t.checked ? ui.guideDone.add(i) : ui.guideDone.delete(i);
    render();
    app.querySelector(`[data-step="${i}"]`)?.focus();
  } else if (t.dataset.id) {
    t.checked ? ui.keepIds.delete(t.dataset.id) : ui.keepIds.add(t.dataset.id);
    t.closest('.item').classList.toggle('kept', !t.checked);
    refreshSelection();
  } else if (t.name === 'type') {
    ui.types = [...app.querySelectorAll('input[name=type]:checked')].map((i) => i.value);
    ui.shown = PAGE_SIZE;
    refreshReview();
  } else if (t.name === 'preset') {
    applyPreset(t.value);
    render();
  } else if (t.id === 'archive') {
    importArchive(t.files);
  } else if (t.id === 'overwrite') {
    ui.overwrite = t.checked;
  } else if (t.id === 'understood') {
    ui.understood = t.checked;
    app.querySelector('[data-action="delete"]').disabled = !t.checked;
  }
});

app.addEventListener('input', (e) => {
  const t = e.target;
  if (['from', 'to', 'keepMinScore', 'keepCommunities', 'keepKeywords'].includes(t.id)) {
    ui[t.id] = t.value;
    ui.shown = PAGE_SIZE;
    refreshReview();
  }
});

// Drag and drop for the archive file.
app.addEventListener('dragover', (e) => {
  const zone = e.target.closest?.('#dropzone');
  if (!zone) return;
  e.preventDefault();
  zone.classList.add('over');
});
app.addEventListener('dragleave', (e) => e.target.closest?.('#dropzone')?.classList.remove('over'));
app.addEventListener('drop', (e) => {
  const zone = e.target.closest?.('#dropzone');
  if (!zone) return;
  e.preventDefault();
  zone.classList.remove('over');
  importArchive(e.dataTransfer.files);
});

function setImportStatus(text) {
  ui.importStatus = text;
  const el = document.getElementById('importStatus');
  if (el) el.textContent = text;
}

async function importArchive(files) {
  if (!files?.length) return;
  setImportStatus('Reading your archive…');
  try {
    const { posts: imported, accountId, username } = await ARCHIVE_READERS[job.platform]([...files]);
    setImportStatus(`Found ${plural(imported.length, 'item')}. Loading…`);
    ui.keepIds.clear();
    ui.from = ui.to = '';
    await send('importPosts', { posts: imported, source: { accountId, username } });
  } catch (e) {
    setImportStatus(`We couldn't read that file. Make sure it's the .zip ${cfg().name} emailed you. (${e.message})`);
  }
}

// ---------- state sync ----------

async function onJob(newJob) {
  const statusChanged = newJob?.status !== lastStatus;
  job = newJob;
  // A login check first resets the job to idle; keep the spinner until it finishes.
  if (job?.status !== 'idle' || job?.error) ui.checking = false;
  if (job?.platform && job.platform !== ui.platform) {
    ui.platform = job.platform;
    ui.types = PLATFORMS[job.platform].types.map((x) => x.id);
  }
  if (statusChanged) {
    ui.confirmStop = false;
    ui.confirmClear = false;
    if (job?.status !== 'connected') ui.importStatus = '';
  }
  if (job?.status === 'ready' && statusChanged) {
    posts = (await chrome.storage.local.get(`posts:${job.platform}`))[`posts:${job.platform}`] || [];
    // Reopening the panel: start from the range that was scanned.
    if (!ui.from && !ui.to && job.range) {
      ui.from = toDateInput(job.range.from);
      ui.to = toDateInput(job.range.to);
    }
    if (job.types?.length) ui.types = job.types;
    ui.confirming = false;
  }
  // While reviewing, only re-render on a status change so typing isn't interrupted.
  if (job?.status === 'ready' && !statusChanged) return;
  render();
  if (statusChanged) window.scrollTo(0, 0);
}

applyPreset(ui.preset);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.job) onJob(changes.job.newValue);
});

chrome.storage.local.get('job').then(({ job: j }) => onJob(j || null));
