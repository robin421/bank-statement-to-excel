#!/usr/bin/env node
/**
 * Bank verification workflow.
 *
 * Turns a real statement into the evidence a bank page needs before it may be
 * published. Everything here runs locally: statements are PII and must never be
 * committed, so this reads from fixtures/real/ (gitignored) and prints a report
 * to stdout.
 *
 *   node scripts/verify-bank.mjs fixtures/real/chase-jan.pdf --bank chase
 *   node scripts/verify-bank.mjs fixtures/real/hdfc.pdf --bank hdfc --password 1234
 *
 * Exit code is 0 only when the statement reconciled against its own running
 * balance, so this can gate a release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { convertDocument } from '../src/lib/parse/index.ts';
import { BANKS } from '../src/data/banks.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const STANDARD_FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

if (!file) {
  console.error('usage: node scripts/verify-bank.mjs <statement.pdf> [--bank slug] [--password pw]');
  process.exit(2);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(2);
}

const bankSlug = flag('bank');
const bank = bankSlug ? BANKS.find((entry) => entry.slug === bankSlug) : undefined;
if (bankSlug && !bank) {
  console.error(`Unknown bank "${bankSlug}". Known: ${BANKS.map((entry) => entry.slug).join(', ')}`);
  process.exit(2);
}

const bytes = new Uint8Array(fs.readFileSync(file));

let result;
try {
  const doc = await pdfjs.getDocument({
    data: bytes,
    password: flag('password'),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: STANDARD_FONTS,
  }).promise;
  result = await convertDocument(doc);
  await doc.destroy?.();
} catch (error) {
  // A scan is a normal outcome, not a crash. Report it the same way the UI does.
  const name = error?.name;
  const message = error instanceof Error ? error.message : String(error);
  console.log(`\n${path.basename(file)}`);
  console.log(`  refused                   ${name ?? 'Error'}: ${message}`);
  console.log(`\n  FAIL — nothing to publish (the parser refused rather than guessing)\n`);
  process.exit(1);
}

const rate = result.reconciliation.passRate;
const checked = result.reconciliation.checked;

/* --------------------------------------------------------------- report */

const line = (label, value) => console.log(`  ${label.padEnd(26)} ${value}`);

console.log(`\n${path.basename(file)}`);
if (bank) console.log(`  bank                       ${bank.name} (${bank.country}, ${bank.currency})`);
console.log('');
line('pages', result.meta.pages);
line('rows recovered', result.transactions.length);
line('layout detected', result.meta.hypothesis);
line('date order', `${result.dateOrder}${result.dateOrderAmbiguous ? ' (ambiguous — nothing proved it)' : ' (proved by the document)'}`);
line('quality', result.quality.status);
line('balance chain', checked ? `${result.reconciliation.matched}/${checked} = ${(rate * 100).toFixed(1)}%` : 'no balance column found');
line('sign corrections', result.reconciliation.signCorrections ?? 0);

const flagged = result.transactions.filter((row) => row.flags.some((f) => f !== 'multiline-description'));
line('flagged rows', flagged.length);
if (flagged.length) {
  const counts = new Map();
  for (const row of flagged) for (const f of row.flags) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [flagName, count] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`      ${flagName.padEnd(24)} ${count}`);
}

if (result.warnings.length) {
  console.log('\n  warnings');
  for (const warning of result.warnings) console.log(`    - ${warning}`);
}

// Deliberately aggregate only. Merchant names are PII and this output may be
// pasted into an issue or a commit message.
console.log('\n  first and last row (no descriptions)');
const first = result.transactions[0];
const last = result.transactions[result.transactions.length - 1];
if (first) line('first', `${first.dateRaw}  amount ${first.amount}  balance ${first.balance}`);
if (last) line('last', `${last.dateRaw}  amount ${last.amount}  balance ${last.balance}`);

/* ------------------------------------------------- hypotheses to check */

if (bank) {
  console.log(`\n  layout hypotheses for ${bank.name} — confirm or refute each:`);
  for (const note of bank.layoutNotes) {
    const mark = note.state === 'confirmed' ? '✓' : note.state === 'refuted' ? '✗' : '?';
    console.log(`    ${mark} ${note.text}`);
    if (note.observation) console.log(`        observed: ${note.observation}`);
  }
}

/* ------------------------------------------------------------ verdict */

const publishable = checked > 0 && rate >= 0.95 && result.quality.status !== 'needs_ocr' && result.transactions.length >= 3;
console.log(
  `\n  ${publishable ? 'PASS' : 'FAIL'} — ${publishable ? 'publishable: reconciles against its own balance' : 'not publishable yet'}\n`,
);

const report = {
  file: path.basename(file),
  bank: bank?.slug ?? null,
  date: new Date().toISOString().slice(0, 10),
  pages: result.meta.pages,
  rows: result.transactions.length,
  reconcileRate: Number(rate.toFixed(4)),
  reconcileChecked: checked,
  dateOrder: result.dateOrder,
  dateOrderAmbiguous: result.dateOrderAmbiguous,
  layout: result.meta.hypothesis,
  quality: result.quality.status,
  flags: [...new Set(result.transactions.flatMap((row) => row.flags))],
  issues: result.warnings,
  publishable,
};

fs.mkdirSync('fixtures/reports', { recursive: true });
const out = path.join('fixtures/reports', `${path.basename(file, '.pdf')}.json`);
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(`  report written to ${out} (aggregate only, no descriptions)\n`);

process.exit(publishable ? 0 : 1);
