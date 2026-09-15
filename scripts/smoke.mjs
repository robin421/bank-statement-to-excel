#!/usr/bin/env node
/**
 * End-to-end smoke test for the browser converter.
 *
 * Everything below the UI is covered by unit tests, but three claims can only be
 * checked in a real browser:
 *   1. the pdf.js worker and the lazily-imported chunks actually load and run;
 *   2. the download produces a usable file;
 *   3. the statement is never uploaded — asserted by watching every network
 *      request the page makes while converting.
 *
 *   node scripts/smoke.mjs [baseUrl]
 *
 * Expects a server already running (npm run preview) unless a URL is given.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4321;
const BASE = process.argv[2] ?? `http://localhost:${PORT}`;

const checks = [];
function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
  const mark = condition ? '  ✓' : '  ✗';
  console.log(`${mark} ${name}${condition || !detail ? '' : ` — ${detail}`}`);
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function main() {
  let server = null;
  const managed = !process.argv[2];

  if (managed) {
    console.log('starting preview server…');
    server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], {
      cwd: root,
      stdio: 'ignore',
      detached: false,
    });
    const up = await waitForServer(`${BASE}/`);
    if (!up) throw new Error(`preview server did not start at ${BASE}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  // CSP violations are reported to the console, not as page errors, so a strict
  // policy that breaks pdf.js would otherwise deploy silently.
  const cspViolations = [];
  page.on('console', (message) => {
    const text = message.text();
    if (/Content Security Policy|Refused to (load|connect|execute|create|run)/i.test(text)) cspViolations.push(text);
    if (message.type() === 'error' && !cspViolations.includes(text)) consoleErrors.push(text);
  });

  try {
    console.log(`\nconverting fixtures in a real browser (${BASE})\n`);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

    check('homepage renders the H1', (await page.locator('h1').first().innerText()).includes('bank statement PDF to Excel'));

    // Convert a statement end to end.
    await page.setInputFiles('input[type=file]', path.join(root, 'fixtures/pdf/chase-like.pdf'));

    // Scope to the converter: the homepage also has a sample table with class .data.
    await page.waitForSelector('.converter table.data tbody tr', { timeout: 45_000 });
    const rowCount = await page.locator('.converter table.data tbody tr').count();
    check('rows appear in the preview', rowCount >= 20, `${rowCount} rows rendered`);

    const badge = await page.locator('.converter__head .badge').first().innerText();
    check('reconcile badge reports a verified balance chain', /reconcile/i.test(badge), badge);

    const meta = await page.locator('.converter__meta').innerText();
    check('page count is reported', /page/i.test(meta), meta.replace(/\s+/g, ' '));

    // Download CSV.
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('.download-bar__actions button', { hasText: 'Download Excel' }).click(),
    ]);
    const csvPath = path.join(root, '.smoke-download.xlsx');
    await csvDownload.saveAs(csvPath);
    const size = fs.statSync(csvPath).size;
    const magic = fs.readFileSync(csvPath).subarray(0, 2).toString('latin1');
    check('xlsx download produced a zip container', magic === 'PK' && size > 4000, `${size} bytes, magic ${JSON.stringify(magic)}`);
    fs.rmSync(csvPath, { force: true });

    // Download the QuickBooks CSV preset too.
    await page.selectOption('#preset', 'quickbooks');
    const [qbDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('.download-bar__actions button').first().click(),
    ]);
    const qbPath = path.join(root, '.smoke-download.csv');
    await qbDownload.saveAs(qbPath);
    const qbText = fs.readFileSync(qbPath, 'utf8').replace(/^\uFEFF/, '');
    const header = qbText.split('\r\n')[0];
    check('QuickBooks preset header is correct', header === 'Date,Description,Amount', header);
    check('QuickBooks preset has one row per transaction', qbText.trim().split('\r\n').length - 1 === rowCount);
    fs.rmSync(qbPath, { force: true });

    /*
     * The privacy claim, tested in three parts rather than one.
     *
     * The old single assertion — "no external request at all" — stops being the
     * right test once Google Analytics is wired in, because a consenting visitor is
     * supposed to produce analytics requests. Weakening it to accommodate that would
     * have thrown away the guarantee. Instead it is split into claims that stay true
     * under either configuration:
     *
     *   1. with no consent given — which is the state in this run — still zero
     *      external requests, so "nothing runs until you allow it" is enforced
     *   2. no outbound request ever carries statement content
     *   3. nothing is sent to a host outside the CSP connect-src allowlist
     */

    // 1. Nothing third-party may load before consent.
    const external = requests.filter(
      (url) => !url.startsWith(BASE) && !url.startsWith('blob:') && !url.startsWith('data:'),
    );
    check('no external requests before consent', external.length === 0, external.slice(0, 4).join(', '));

    check(
      'analytics consent banner is shown, so the choice is offered rather than assumed',
      (await page.locator('#consent-banner').count()) > 0,
    );

    // 2. Statement content must not appear in any outbound request. Checked against
    //    strings that exist only inside the fixture statement.
    const STATEMENT_MARKERS = ['ACME PAYROLL', 'NORTHWIND TRADING', 'WHOLE FOODS', '4821 MAIN ST'];
    const leaked = requests.filter((url) =>
      STATEMENT_MARKERS.some((marker) => decodeURIComponent(url).toUpperCase().includes(marker)),
    );
    check('no request carries statement content', leaked.length === 0, leaked.slice(0, 3).join(', '));

    // 3. Allowlist, mirroring the CSP connect-src directive.
    const ALLOWED_EXTERNAL = [
      'static.cloudflareinsights.com',
      'cloudflareinsights.com',
      'www.google-analytics.com',
      'google-analytics.com',
      'analytics.google.com',
      'www.googletagmanager.com',
    ];
    const offAllowlist = external.filter((url) => !ALLOWED_EXTERNAL.some((host) => url.includes(host)));
    check('no request to a host outside the connect-src allowlist', offAllowlist.length === 0, offAllowlist.slice(0, 3).join(', '));

    /*
     * The consenting path, when analytics is configured in this build.
     *
     * "Nothing loads before consent" is only half the feature. The other half is
     * that analytics actually works once allowed, so this drives the real banner,
     * then asserts the tag was fetched and that doing so broke no CSP rule. Skipped
     * when no measurement id is configured, which is the repository default.
     */
    if ((await page.locator('#consent-banner').count()) > 0) {
      const before = requests.length;
      await page.locator('#consent-banner [data-consent="granted"]').click();
      await page.waitForFunction(() => Boolean(window.__analyticsLoaded), undefined, { timeout: 15_000 });
      await page.waitForTimeout(1500);

      const afterConsent = requests.slice(before);
      check(
        'consenting loads the analytics tag',
        afterConsent.some((url) => url.includes('googletagmanager.com')),
        afterConsent.join(', ').slice(0, 120),
      );
      check(
        'the banner does not reappear after a decision',
        await page.locator('#consent-banner').isHidden(),
      );
      check(
        'analytics traffic keeps statement content out',
        afterConsent.every((url) => !STATEMENT_MARKERS.some((m) => decodeURIComponent(url).toUpperCase().includes(m))),
      );
    }

    const uploads = requests.filter(
      (url) =>
        !url.includes('/_astro/') &&
        /(\/upload|\/api\/|\/convert\b|\/submit)/i.test(new URL(url).pathname),
    );
    check('no upload-shaped requests', uploads.length === 0, uploads.slice(0, 3).join(', '));

    check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    check(
      'Content-Security-Policy causes no violations',
      cspViolations.length === 0,
      cspViolations.slice(0, 2).join(' | '),
    );

    // An image-only PDF must be refused, not guessed at.
    await page.locator('.btn--link', { hasText: 'Start over' }).first().click();
    await page.setInputFiles('input[type=file]', path.join(root, 'fixtures/pdf/scan-no-text.pdf'));
    await page.waitForSelector('.note--danger', { timeout: 30_000 });
    const errorText = await page.locator('.note--danger').first().innerText();
    check('scanned PDF is refused with an explanation', /text layer|scan/i.test(errorText), errorText.slice(0, 90));

    // OFX path.
    await page.locator('button', { hasText: 'Try another file' }).click();    const ofxPath = path.join(root, '.smoke.ofx');
    fs.writeFileSync(
      ofxPath,
      'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD<BANKTRANLIST>\n' +
        '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250104000000<TRNAMT>317.92<FITID>1<NAME>ACME PAYROLL</STMTTRN>\n' +
        '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250106000000<TRNAMT>-806.84<FITID>2<NAME>INSURANCE PREMIUM</STMTTRN>\n' +
        '</BANKTRANLIST><LEDGERBAL><BALAMT>3311.08<DTASOF>20250131</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
    );
    await page.setInputFiles('input[type=file]', ofxPath);
    await page.waitForSelector('.converter table.data tbody tr', { timeout: 30_000 });
    const ofxRows = await page.locator('.converter table.data tbody tr').count();
    check('OFX file converts through the same UI', ofxRows === 2, `${ofxRows} rows`);
    fs.rmSync(ofxPath, { force: true });

    /* ---------------------------------------------------------------- i18n */

    await page.goto(`${BASE}/de/`, { waitUntil: 'networkidle' });
    const htmlLang = await page.getAttribute('html', 'lang');
    check('German page declares lang="de"', htmlLang === 'de', String(htmlLang));

    const alternates = await page.locator('link[rel=alternate]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('hreflang')).filter(Boolean),
    );
    check(
      'German page emits hreflang for all six locales plus x-default',
      ['en', 'de', 'es', 'fr', 'pt', 'hi', 'x-default'].every((code) => alternates.includes(code)),
      alternates.join(','),
    );

    await page.setInputFiles('input[type=file]', path.join(root, 'fixtures/pdf/euro-decimal.pdf'));
    await page.waitForSelector('.converter table.data tbody tr', { timeout: 45_000 });

    const germanBadge = await page.locator('.converter__head .badge').first().innerText();
    check('converter UI is actually translated on /de/', /Zeilen stimmen überein/.test(germanBadge), germanBadge);

    const germanHeaders = (await page.locator('.converter table.data thead th').allInnerTexts()).map((text) =>
      text.toLowerCase(),
    );
    check(
      'table headers are translated',
      germanHeaders.includes('datum') && germanHeaders.includes('saldo'),
      germanHeaders.join('|'),
    );

    // The whole point: a German user's downloaded file must be semicolon-
    // delimited with comma decimals, or their Excel shows one column.
    await page.selectOption('#preset', 'quickbooks');
    const [deDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.locator('.download-bar__actions button').first().click(),
    ]);
    const dePath = path.join(root, '.smoke-de.csv');
    await deDownload.saveAs(dePath);
    const deText = fs.readFileSync(dePath, 'utf8').replace(/^\uFEFF/, '');
    const deLines = deText.split('\r\n').filter(Boolean);
    check('German CSV declares Date;Description;Amount', deLines[0] === 'Date;Description;Amount', deLines[0]);
    check('German CSV uses semicolons (three fields per line)', deLines[1].split(';').length === 3, deLines[1]);
    check('German CSV uses a comma decimal and a German date', /^\d{2}\.\d{2}\.\d{4};.*;-?\d+,\d{2}$/.test(deLines[1]), deLines[1]);
    fs.rmSync(dePath, { force: true });

    // Switchback: the German page must still offer Swiss German, whose digits
    // are dot-decimal with an apostrophe separator — the opposite convention.
    await page.selectOption('#export-locale', 'de-CH');
    const swissHeaders = (await page.locator('.converter table.data thead th').allInnerTexts()).join('|');
    check('German page offers Swiss German as an alternative format', /saldo/i.test(swissHeaders), swissHeaders);

    console.log('');
  } finally {
    await browser.close();
    if (server) server.kill('SIGTERM');
  }

  const failed = checks.filter((entry) => !entry.ok);
  if (failed.length) {
    console.error(`\n${failed.length} smoke check(s) failed:\n${failed.map((entry) => `  - ${entry.name}: ${entry.detail}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`all ${checks.length} smoke checks passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
