#!/usr/bin/env node
/**
 * Renders the social preview image and PNG icons from HTML/SVG with Playwright.
 *
 *   node scripts/og-image.mjs            # writes public/og.png, public/apple-touch-icon.png
 *   node scripts/og-image.mjs <outDir>   # also writes icon-512.png / icon-240.png there
 *
 * Needs a Chromium build (npx playwright install chromium) or CHROME_PATH.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const favicon = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
const extraDir = process.argv[2];

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fbfaf7; color: #131720;
    font-family: 'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; position: relative; overflow: hidden; }
  .band { position: absolute; inset: 0 auto 0 0; width: 12px; background: #0e6f66; }
  .wrap { position: absolute; left: 84px; top: 64px; width: 680px; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 34px; font-weight: 700; letter-spacing: -0.5px; }
  .brand svg { width: 64px; height: 64px; }
  h1 { margin-top: 44px; font-size: 58px; line-height: 1.08; letter-spacing: -1.5px; font-weight: 800; }
  h1 .arrow { color: #0e6f66; }
  .sub { margin-top: 20px; font-size: 26px; color: #3d4854; }
  ul { list-style: none; padding: 0; margin-top: 30px; display: flex; gap: 28px; font-size: 22px; color: #3d4854; }
  li::before { content: '✓'; color: #0b6b4f; font-weight: 800; margin-right: 8px; }
  .sheet { position: absolute; right: 56px; top: 150px; width: 350px; background: #fff; border: 1px solid #e2ded3;
    border-radius: 14px; box-shadow: 0 18px 40px rgba(19,23,32,.10); overflow: hidden; font-size: 15px; }
  .sheet .head { background: #0e6f66; color: #fff; padding: 12px 16px; font-weight: 700; display: flex; justify-content: space-between; }
  .row { display: grid; grid-template-columns: 58px 1fr 86px 24px; gap: 8px; padding: 10px 16px; border-top: 1px solid #efece4; align-items: center; }
  .row .amt { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, Menlo, monospace; font-size: 14px; }
  .ok { color: #0b6b4f; font-weight: 800; text-align: center; }
  .foot { padding: 12px 16px; background: #e2f3ec; color: #06403b; font-weight: 700; font-size: 14px; }
  .url { position: absolute; left: 84px; bottom: 34px; font-size: 20px; color: #6b7683; }
</style></head><body>
  <div class="band"></div>
  <div class="wrap">
    <div class="brand">${favicon}<span>StatementToExcel</span></div>
    <h1>Bank statement PDF<br><span class="arrow">→</span> Excel/CSV,<br>in your browser</h1>
    <p class="sub">Free. Your statement never leaves your device.</p>
    <ul><li>Never uploaded</li><li>No sign-up</li><li>Rows checked</li></ul>
  </div>
  <div class="sheet">
    <div class="head"><span>transactions.xlsx</span><span>Balance</span></div>
    <div class="row"><span>01/04</span><span>Payroll deposit</span><span class="amt">+317.92</span><span class="ok">✓</span></div>
    <div class="row"><span>01/06</span><span>Auto insurance</span><span class="amt">−806.84</span><span class="ok">✓</span></div>
    <div class="row"><span>01/09</span><span>Check #1042</span><span class="amt">−88.50</span><span class="ok">✓</span></div>
    <div class="row"><span>01/12</span><span>Grocery store</span><span class="amt">−64.18</span><span class="ok">✓</span></div>
    <div class="row"><span>01/15</span><span>To savings</span><span class="amt">−250.00</span><span class="ok">✓</span></div>
    <div class="foot">Every row reconciles with the running balance</div>
  </div>
  <div class="url">wattflow.net</div>
</body></html>`;

const iconHtml = (size) => `<!doctype html><html><head><style>*{margin:0}body{width:${size}px;height:${size}px;background:transparent}
svg{width:${size}px;height:${size}px;display:block}</style></head><body>${favicon}</body></html>`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
async function render(html, width, height, out, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
  console.log('wrote', path.relative(process.cwd(), out));
}

await render(ogHtml, 1200, 630, path.join(root, 'public/og.png'));
await render(iconHtml(180), 180, 180, path.join(root, 'public/apple-touch-icon.png'));
if (extraDir) {
  fs.mkdirSync(extraDir, { recursive: true });
  await render(iconHtml(512), 512, 512, path.join(extraDir, 'icon-512.png'), true);
  await render(iconHtml(240), 240, 240, path.join(extraDir, 'icon-240.png'), true);
  fs.copyFileSync(path.join(root, 'public/og.png'), path.join(extraDir, 'og-1200x630.png'));
}
await browser.close();
