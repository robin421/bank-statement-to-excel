#!/usr/bin/env node
/**
 * Money-token sequence dump.
 *
 * The Sparse Balance Constraint decoder operates on the ordered sequence of
 * money tokens, so this shows exactly that sequence — page, baseline, x, right
 * edge, value — plus which tokens are adjacent on the same baseline. It is the
 * evidence used to design the decoder, and the first thing to look at when a
 * statement decodes wrongly.
 *
 *   npm run seq:money -- fixtures/real/de-sparkasse-ksk-tuttlingen.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPages } from '../src/lib/pdf/extractPages.ts';
import { buildTokenGraph } from '../src/lib/parse2/tokens.ts';
import { moneyCandidates, moneyReading } from '../src/lib/parse2/amounts.ts';
import { dateReading } from '../src/lib/parse2/dates.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error('usage: npm run seq:money -- <file.pdf> [--lines]');
  process.exit(2);
}

const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(file)),
  useSystemFonts: false,
  disableFontFace: true,
  standardFontDataUrl: FONTS,
}).promise;
const pages = await extractPages(doc);
await doc.destroy?.();

const graph = buildTokenGraph(pages);
const byId = new Map(graph.tokens.map((token) => [token.id, token]));

console.log(`\n${path.basename(file)}`);
console.log(
  `  ${graph.tokens.length} tokens   line pitch ${graph.metrics.linePitch.toFixed(1)}pt   median font ${graph.metrics.medianFontSize.toFixed(1)}pt`,
);

const money = moneyCandidates(graph.tokens, graph.metrics.linePitch, graph.metrics.medianFontSize);
const dates = graph.tokens.map((token) => ({ token, reading: dateReading(token) })).filter((e) => e.reading !== null);

console.log(`  ${money.length} money tokens, ${dates.length} date tokens\n`);

const showLines = rest.includes('--lines');
if (showLines) {
  console.log('  reading order — one line per visual baseline:');
  const seen = new Set<string>();
  for (const token of graph.tokens) {
    if (seen.has(token.id)) continue;
    const ids = [token.id, ...(graph.sameBaseline.get(token.id) ?? [])];
    for (const id of ids) seen.add(id);
    const line = ids.map((id) => byId.get(id)!).sort((a, b) => a.x - b.x);
    const rendered = line
      .map((member) => {
        const m = moneyReading(member);
        const d = dateReading(member);
        const tag = m ? `$${m.value}` : d ? `@${d.iso ?? d.raw}` : member.text;
        return tag;
      })
      .join(' | ');
    console.log(`    p${line[0].page} y=${line[0].y.toFixed(0).padStart(4)}  ${rendered.slice(0, 118)}`);
  }
  console.log('');
}

console.log('  money sequence (the decoder input):');
for (const { token, reading, confidence, columnId } of money) {
  console.log(
    `    p${token.page} y=${token.y.toFixed(0).padStart(4)} x=${token.x.toFixed(0).padStart(4)} r=${(token.x + token.width).toFixed(0).padStart(4)}` +
      `  conf=${confidence.toFixed(2)} ${(columnId ?? '-').padStart(4)}` +
      `  ${reading.value.toFixed(2).padStart(14)}   ${JSON.stringify(token.text)}`,
  );
}
console.log('');
