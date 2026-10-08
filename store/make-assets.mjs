// Builds the store listing images in store/assets from real app screens in
// store/src and the icon. Run: node store/make-assets.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store/assets');
mkdirSync(OUT, { recursive: true });

const dataUrl = (file) => `data:image/png;base64,${readFileSync(path.join(ROOT, file)).toString('base64')}`;
const iconSvg = readFileSync(path.join(ROOT, 'icons/icon.svg'), 'utf8');
const icon = (size) => iconSvg.replace('<svg ', `<svg width="${size}" height="${size}" `);

const BASE = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, system-ui, sans-serif; color: #17181c; overflow: hidden; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; }
`;

const SCREENS = [
  { file: 'choose', title: 'Clean up 6 platforms', text: 'Reddit, X and Facebook automatically. Instagram, LinkedIn and Threads with a step-by-step guide.' },
  { file: 'review', offset: 560, title: 'Review before anything goes', text: 'Pick a date range, see your posts by year, and untick anything you want to keep.' },
  { file: 'confirm', offset: 110, title: 'Backup first. Always.', text: 'A copy of every post saves to your computer before anything is deleted.' },
  { file: 'done', title: 'Private by design', text: 'Runs entirely on your computer. No passwords, no tracking, and your list is erased when you finish.' },
  { file: 'guide', title: 'Guided where it’s safer', text: 'For sites that don’t allow tools to delete posts, a checklist opens each site’s own pages for you.' },
];

// offset: how far down the app screen to start, to show its most useful part.
const screenshotPage = ({ file, title, text, offset = 0 }, n) => `<html><head><style>${BASE}
  body { width: 1280px; height: 800px; background: linear-gradient(135deg, #f4f6ff 0%, #e4e9ff 100%); position: relative; }
  .copy { position: absolute; left: 96px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .step { font-size: 18px; font-weight: 600; color: #3b5bdb; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 64px; }
  h1 { font-size: 60px; line-height: 1.08; letter-spacing: -0.02em; margin-top: 14px; }
  p { font-size: 26px; line-height: 1.45; color: #4d5160; margin-top: 22px; }
  .phone { position: absolute; right: 110px; top: 56px; width: 440px; height: 688px; border-radius: 28px; overflow: hidden;
    background: #f6f7f9; box-shadow: 0 30px 80px rgba(36, 52, 130, 0.28), 0 0 0 1px rgba(36, 52, 130, 0.08); }
  .phone img { width: 440px; display: block; }
  .blob { position: absolute; right: -120px; bottom: -160px; width: 620px; height: 620px; border-radius: 50%; background: rgba(59, 91, 219, 0.10); }
</style></head><body>
  <div class="blob"></div>
  <div class="copy">
    <div class="brand">${icon(44)}Social Cleanup</div>
    <div class="step">${n} of ${SCREENS.length}</div>
    <h1>${title}</h1>
    <p>${text}</p>
  </div>
  <div class="phone"><img src="${dataUrl(`store/src/${file}.png`)}" style="margin-top:-${offset}px"></div>
</body></html>`;

const tile = (w, h, { big }) => `<html><head><style>${BASE}
  body { width: ${w}px; height: ${h}px; background: linear-gradient(135deg, #5c7cfa, #364fc7); color: #fff; display: flex; align-items: center; padding: 0 ${big ? 90 : 34}px; gap: ${big ? 50 : 0}px; position: relative; }
  .copy { flex: ${big ? '0 0 600px' : '1'}; }
  .name { white-space: nowrap; }
  .name { display: flex; align-items: center; gap: ${big ? 22 : 14}px; font-weight: 800; font-size: ${big ? 60 : 34}px; letter-spacing: -0.01em; }
  .name svg { filter: drop-shadow(0 6px 16px rgba(0,0,0,0.2)); border-radius: 22%; }
  .tag { font-size: ${big ? 30 : 19}px; line-height: 1.35; opacity: 0.92; margin-top: ${big ? 22 : 14}px; font-weight: 500; }
  .pills { display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap; }
  .pill { border: 2px solid rgba(255,255,255,0.6); border-radius: 999px; padding: 8px 20px; font-size: 22px; font-weight: 600; }
  .shots { display: flex; gap: 22px; align-self: flex-end; margin-bottom: -60px; }
  .shots div { width: 270px; height: 520px; border-radius: 22px; overflow: hidden; background: #f6f7f9; box-shadow: 0 24px 60px rgba(0,0,0,0.3); }
  .shots div:nth-child(2) { margin-top: 70px; }
  .shots img { width: 270px; display: block; }
</style></head><body>
  <div class="copy">
    <div class="name">${icon(big ? 96 : 64)}Social Cleanup</div>
    <div class="tag">${big ? 'Delete years of old social media posts in a few clicks.<br>Private, free and open source.' : 'Delete your old posts<br>in a few clicks.'}</div>
    ${big ? '<div class="pills"><span class="pill">Reddit</span><span class="pill">X</span><span class="pill">Facebook</span><span class="pill">+3 guided</span></div>' : ''}
  </div>
  ${big ? `<div class="shots"><div><img src="${dataUrl('store/src/review.png')}"></div><div><img src="${dataUrl('store/src/confirm.png')}"></div></div>` : ''}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shoot(html, w, h, name) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html);
  await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
  await page.screenshot({ path: path.join(OUT, name) });
}
for (const [i, s] of SCREENS.entries()) await shoot(screenshotPage(s, i + 1), 1280, 800, `screenshot-${i + 1}-${s.file}.png`);
await shoot(tile(440, 280, { big: false }), 440, 280, 'promo-small-440x280.png');
await shoot(tile(1400, 560, { big: true }), 1400, 560, 'promo-marquee-1400x560.png');
await shoot(`<html><body style="margin:0;width:300px;height:300px">${icon(300)}</body></html>`, 300, 300, 'logo-300x300.png');
await browser.close();
console.log('store assets written to', OUT);
