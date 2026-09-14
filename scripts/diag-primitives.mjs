#!/usr/bin/env node
/**
 * Post-hoc diagnostic — Stage 1: primitive candidate existence.
 *
 * Answers the first of the three questions from the brief, and it is the cheapest
 * one: does the frozen parser's candidate space even CONTAIN the correct answer?
 *
 * Read-only. It calls buildLines() and reads the money candidates out of it. No
 * parser file is modified, no search is run, no scoring is touched. If a primitive
 * is missing here, no beam width can recover it, and the beam sweep is pointless.
 *
 *   npx vite-node scripts/diag-primitives.mjs -- corpus/court/C06-stretto-x130.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPages } from '../src/lib/pdf/extractPages.ts';
import { buildLines } from '../src/lib/parse2/lines.ts';
import { dateReading } from '../src/lib/parse2/dates.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const [pdfPath, gtPath] = process.argv.slice(2).filter((a) => a !== '--');
const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));
const TOL = 0.011;

const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(pdfPath)),
  useSystemFonts: false,
  disableFontFace: true,
  standardFontDataUrl: FONTS,
}).promise;
const pages = await extractPages(doc);
await doc.destroy?.();

const index = buildLines(pages);

/* Every money candidate the frozen candidate layer produced, flattened. */
const candidates = index.lines.flatMap((line) =>
  line.money.map((c) => ({
    tokenId: c.token.id,
    text: c.token.text,
    value: c.reading.value,
    magnitude: c.reading.magnitude,
    confidence: c.confidence,
    columnId: c.columnId,
    columnSupport: c.columnSupport,
    lineId: line.id,
    hasSign: c.reading.evidence.hasSign,
    // The frozen decoder only gives a role to the best five figures on a line and
    // only above a confidence floor. A primitive that fails either test cannot be
    // used by the search however wide the beam is.
    roleEligible: false,
  })),
);

/* Re-derive the per-line role eligibility exactly as decode.ts defines it. */
const MAX_ROLE_TOKENS_PER_LINE = 5;
const MIN_CONFIDENCE = 0.55;
for (const line of index.lines) {
  const eligible = new Set(
    [...line.money]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_ROLE_TOKENS_PER_LINE)
      .map((c) => c.token.id),
  );
  for (const c of candidates) {
    if (c.lineId === line.id) c.roleEligible = eligible.has(c.tokenId) && c.confidence >= MIN_CONFIDENCE;
  }
}

const dateTokens = index.graph.tokens
  .map((token) => ({ token, reading: dateReading(token) }))
  .filter((entry) => entry.reading !== null);

console.log(`\n${path.basename(pdfPath)}   GT: ${gt.statementId}`);
console.log(`  money candidates ${candidates.length}   role-eligible ${candidates.filter((c) => c.roleEligible).length}   date candidates ${dateTokens.length}`);
console.log(`  lines ${index.lines.length}\n`);

function findPrimitive(label, value) {
  const hits = candidates.filter((c) => Math.abs(Math.abs(c.value) - Math.abs(value)) <= TOL);
  if (!hits.length) {
    console.log(`  ${label.padEnd(34)} ${String(value).padStart(14)}   NOT FOUND`);
    return { label, value, found: false };
  }
  const best = hits.sort((a, b) => b.confidence - a.confidence)[0];
  console.log(
    `  ${label.padEnd(34)} ${String(value).padStart(14)}   FOUND  ` +
      `conf=${best.confidence.toFixed(2)} col=${best.columnId ?? '-'} support=${best.columnSupport.toFixed(2)} ` +
      `signed=${best.hasSign} roleEligible=${best.roleEligible}  ${JSON.stringify(best.text)}`,
  );
  return { label, value, found: true, roleEligible: best.roleEligible, hasSign: best.hasSign };
}

console.log('  PRIMITIVE CANDIDATES');
console.log('  ' + '-'.repeat(104));
const results = [];
results.push(findPrimitive('opening balance anchor', gt.openingBalance));
results.push(findPrimitive('closing balance anchor', gt.closingBalance));

if (gt.transactions?.length) {
  console.log('');
  let found = 0;
  let eligible = 0;
  for (const [i, tx] of gt.transactions.entries()) {
    const r = findPrimitive(`tx #${i + 1} (${tx.date ?? '—'})`, tx.amount);
    if (r.found) found += 1;
    if (r.roleEligible) eligible += 1;
    results.push(r);
  }
  console.log(`\n  GT transactions: ${gt.transactions.length}   amount primitive found: ${found}   role-eligible: ${eligible}`);
}

const allFound = results.every((r) => r.found);
const allEligible = results.filter((r) => r.label.startsWith('tx')).every((r) => r.roleEligible);

console.log('');
if (!allFound) {
  console.log('  EARLIEST FAILURE STAGE: PRIMITIVE_CANDIDATE_GENERATION_FAILURE');
  console.log('  A required primitive is absent. No beam width can recover it; beam sweep skipped.');
} else if (!allEligible) {
  console.log('  EARLIEST FAILURE STAGE: PRIMITIVE_NOT_ROLE_ELIGIBLE');
  console.log('  Every primitive exists but at least one cannot be given a role by the frozen decoder.');
} else {
  console.log('  All primitives present and role-eligible -> proceed to transaction grouping / path checks.');
}
console.log('');
