#!/usr/bin/env node
/**
 * Statement inspector.
 *
 * The debugging counterpart to verify:bank. When a real statement does not
 * parse, this shows what the parser actually sees — the rows it rebuilt, where
 * the text sits, and how each cell was classified — which is the only way to
 * tell a geometry problem from a genuinely absent table.
 *
 *   npm run inspect:statement -- fixtures/real/x.pdf          # first 40 rows
 *   npm run inspect:statement -- fixtures/real/x.pdf 120      # more rows
 *   npm run inspect:statement -- fixtures/real/x.pdf 40 bands # include column model
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPages } from '../src/lib/pdf/extractPages.ts';
import { buildRows } from '../src/lib/parse/rows.ts';
import { classifyCell, detectColumns } from '../src/lib/parse/columns.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const [file, limitArg, mode] = process.argv.slice(2);
if (!file) {
  console.error('usage: npm run inspect:statement -- <file.pdf> [rows] [bands]');
  process.exit(2);
}
const limit = Number(limitArg ?? 40);

const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  useSystemFonts: false,
  disableFontFace: true,
  standardFontDataUrl: FONTS,
}).promise;

const pages = await extractPages(doc);
const rows = buildRows(pages);
await doc.destroy?.();

const items = pages.reduce((total, page) => total + page.items.length, 0);
console.log(`\n${path.basename(file)}`);
console.log(`  pages ${pages.length}   text runs ${items}   rows rebuilt ${rows.length}`);

const classified = { date: 0, money: 0, weak_number: 0, text: 0 };
for (const row of rows) for (const cell of row.cells) classified[classifyCell(cell)] += 1;
console.log(
  `  cells: date ${classified.date}  money ${classified.money}  weak number ${classified.weak_number}  text ${classified.text}`,
);

if (mode === 'bands') {
  const model = detectColumns(rows);
  console.log(`\n  columns (${model.bands.length}):`);
  for (const band of model.bands) {
    console.log(
      `    ${band.id.padEnd(9)} ${band.kind.padEnd(6)} x ${band.left.toFixed(0).padStart(4)}–${band.right.toFixed(0).padStart(4)}  anchor ${band.anchor.toFixed(0).padStart(4)}  cells ${String(band.count).padStart(3)}  ${band.label ?? ''}`,
    );
  }
  console.log(`  description window x ${model.descriptionLeft.toFixed(0)}–${model.descriptionRight.toFixed(0)}`);
  console.log(`  header row: ${model.headerRowIndex ?? 'none'}`);
}

console.log(`\n  first ${Math.min(limit, rows.length)} rows (page, y, font height, then the text):`);
for (const row of rows.slice(0, limit)) {
  const kinds = row.cells.map((cell) => classifyCell(cell)[0].toUpperCase()).join('');
  console.log(`    p${row.page} y=${row.y.toFixed(0).padStart(4)} h=${row.height.toFixed(1).padStart(4)} [${kinds.padEnd(12)}] ${row.text.slice(0, 96)}`);
}
console.log('');
