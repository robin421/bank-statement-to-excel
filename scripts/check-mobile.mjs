/**
 * 移动端溢出回归检查（见 docs/MOBILE.md §7）。
 *
 * 用法：先 `npm run build`，再 `node scripts/check-mobile.mjs`。
 * 在 320 / 360 / 390 三档视口下断言：
 *   1. 所有静态页无页面级横向滚动；
 *   2. 转换器 ready 态（fixture PDF 真实驱动）内部各块不越界。
 *
 * 用本地 Chromium 直接从 dist/ 供文件（绕过该 Chromium 的 Local Network
 * Access 限制），不需要起服务器。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const PAGES = [
  '/', '/de/', '/es/', '/fr/', '/hi/', '/pt/',
  '/blog/', '/blog/excel-from-pdf-bank-statement/', '/blog/how-to-convert-bank-statement-to-excel/',
  '/pdf-bank-statement-to-excel/', '/bank-statement-to-csv/', '/quickbooks-csv/', '/xero-csv/',
  '/ofx-qfx-to-csv/', '/scanned/', '/extract-transactions/',
  '/banks/', '/about/', '/contact/', '/privacy/', '/terms/',
];
const WIDTHS = [390, 360, 320];
const FIXTURE = path.join(ROOT, 'fixtures/pdf/chase-like.pdf');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.xml': 'application/xml', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webp': 'image/webp',
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ 不存在，先跑 npm run build');
  process.exit(2);
}

const failures = [];
const executablePath = fs.existsSync('/opt/meta-chromium/chrome') ? '/opt/meta-chromium/chrome' : undefined;

const browser = await chromium.launch(executablePath ? { executablePath, args: ['--no-sandbox'] } : {});
const ctx = await browser.newContext();
await ctx.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  let file = path.join(DIST, decodeURIComponent(u.pathname));
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) return route.abort();
  await route.fulfill({
    status: 200,
    contentType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    body: fs.readFileSync(file),
  });
});

const page = await ctx.newPage();

/** 列出越界元素（排除合法的横滑容器与无障碍隐藏元素）。 */
async function findOverflows() {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      if (el.closest('.visually-hidden, .skip-link')) return;
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return;
      if (el.closest('.table-wrap, pre')) return; // 表格横滑 / 代码块横滑是设计
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.right > vw + 1 || r.left < -1) {
        const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
        bad.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [${Math.round(r.left)},${Math.round(r.right)}]`);
      }
    });
    return { pageOverflow: Math.round(document.documentElement.scrollWidth - vw), bad: bad.slice(0, 10) };
  });
}

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 844 });

  for (const p of PAGES) {
    await page.goto(`http://local.test${p}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(500);
    const { pageOverflow, bad } = await findOverflows();
    if (pageOverflow > 1 || bad.length > 0) {
      failures.push(`${width}px ${p}: 页面溢出 +${pageOverflow}px；越界元素 ${bad.join(' | ')}`);
      console.log(`FAIL ${width}px ${p} (+${pageOverflow}px)`);
      bad.forEach((b) => console.log(`      ${b}`));
    } else {
      console.log(`ok   ${width}px ${p}`);
    }
  }

  // 转换器 ready 态：fixture 真实驱动（docs/MOBILE.md §6）。
  await page.goto('http://local.test/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.locator('.converter input[type="file"]').setInputFiles(FIXTURE);
  try {
    await page.waitForSelector('.converter__head', { timeout: 45000 });
  } catch {
    failures.push(`${width}px /converter: 60s 内未进入 ready 态`);
    console.log(`FAIL ${width}px /converter（未进入 ready 态）`);
    continue;
  }
  await page.waitForTimeout(600);
  // .converter 自身 overflow:hidden 会静默裁掉内部溢出，所以逐个检查内部块。
  const inner = await page.evaluate((vw) => {
    const bad = [];
    ['.converter__head', '.converter__meta', '.download-bar', '.download-bar__actions', '.privacy-strip', '.table-wrap'].forEach(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) bad.push(`${sel} [${Math.round(r.left)},${Math.round(r.right)}]`);
      },
    );
    return bad;
  }, width);
  if (inner.length > 0) {
    failures.push(`${width}px /converter ready: 内部越界 ${inner.join(' | ')}`);
    console.log(`FAIL ${width}px /converter ready`);
    inner.forEach((b) => console.log(`      ${b}`));
  } else {
    console.log(`ok   ${width}px /converter ready`);
  }
}

await browser.close();

if (failures.length > 0) {
  console.log(`\n${failures.length} 项失败，见 docs/MOBILE.md §2 排查。`);
  process.exit(1);
}
console.log('\n全部通过。');
