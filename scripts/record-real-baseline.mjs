#!/usr/bin/env node
/**
 * Record the parser's current scores against the real-statement corpus.
 *
 *   node scripts/record-real-baseline.mjs
 *
 * Writes fixtures/real-baseline.json, which tests/real-corpus.spec.ts asserts
 * against. The baseline is deliberately the *current* numbers rather than a
 * target: its job is to stop a change from silently making real statements worse,
 * which is exactly what happened when the synthetic corpus scored 100% while
 * real Sparkasse and Postbank statements parsed to zero rows.
 *
 * Files live in fixtures/real/ and are gitignored — they are third-party
 * documents. See the README for where to get them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { convertDocument } from '../src/lib/parse/index.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const dir = 'fixtures/real';
if (!fs.existsSync(dir)) {
  console.error(`No corpus at ${dir}/. Download some statements first (see README).`);
  process.exit(2);
}

const files = fs.readdirSync(dir).filter((name) => name.endsWith('.pdf') && !name.startsWith('._')).sort();
const baseline = {};

for (const name of files) {
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(fs.readFileSync(path.join(dir, name))),
      useSystemFonts: false,
      disableFontFace: true,
      standardFontDataUrl: FONTS,
    }).promise;
    const result = await convertDocument(doc);
    await doc.destroy?.();
    baseline[name] = {
      outcome: 'parsed',
      pages: result.meta.pages,
      rows: result.transactions.length,
      reconcileRate: Number(result.reconciliation.passRate.toFixed(4)),
      reconcileChecked: result.reconciliation.checked,
      quality: result.quality.status,
    };
  } catch (error) {
    baseline[name] = { outcome: 'refused', reason: error?.code ?? 'ERROR' };
  }
}

fs.writeFileSync('fixtures/real-baseline.json', `${JSON.stringify(baseline, null, 2)}\n`);

const parsed = Object.values(baseline).filter((entry) => entry.outcome === 'parsed');
const publishable = parsed.filter((entry) => entry.reconcileChecked >= 3 && entry.reconcileRate >= 0.95);
console.log(`recorded ${files.length} statements`);
console.log(`  parsed        ${parsed.length}`);
console.log(`  refused       ${files.length - parsed.length}  (scans and unreadable layouts — the parser says so rather than guessing)`);
console.log(`  publishable   ${publishable.length}`);
