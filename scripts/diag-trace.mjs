#!/usr/bin/env node
/**
 * Post-hoc diagnostic — Stage 2.
 *
 * (a) Proves the read-only instrumentation is behaviour-neutral by re-running
 *     statements with `trace` OFF and diffing against the immutable v0 artifacts.
 *     If they differ, nothing downstream of this script is trustworthy.
 *
 * (b) Then runs the ground-truth watch trace and reports, per line, whether the
 *     correct search trajectory survived the beam prune and at what rank. This is
 *     what separates SEARCH_PRUNING_FAILURE from SEARCH_RANKING_FAILURE: a state
 *     pruned at rank 40,001 of 40,000 is a narrow-beam problem; one sitting at rank
 *     180,000 is an objective problem that a wider beam would only paper over.
 *
 *   npx vite-node scripts/diag-trace.mjs -- <pdf> <gtJson> [--beam N] [--verify]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPages } from '../src/lib/pdf/extractPages.ts';
import { buildLines } from '../src/lib/parse2/lines.ts';
import { decode } from '../src/lib/parse2/decode.ts';
import { documentYear, inferOrder } from '../src/lib/parse2/dates.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

const args = process.argv.slice(2).filter((a) => a !== '--');
const pdfPath = args[0];
const gtPath = args[1];
const beamArg = args.indexOf('--beam');
const beam = beamArg >= 0 ? Number(args[beamArg + 1]) : 40_000;
const verifyOnly = args.includes('--verify');

const gt = JSON.parse(fs.readFileSync(gtPath, 'utf8'));

async function load(p) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(p)),
    useSystemFonts: false, disableFontFace: true, standardFontDataUrl: FONTS,
  }).promise;
  const pages = await extractPages(doc);
  await doc.destroy?.();
  return pages;
}

const pages = await load(pdfPath);
const index = buildLines(pages);
void inferOrder(index.graph.tokens);
void documentYear(index.graph.tokens);

const R = (n) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- (a) identity */

if (verifyOnly) {
  const artifactId = path.basename(pdfPath).replace(/^.*?(A0\d|S02|C0\d|C10|G01).*$/, '$1');
  const artifactPath = `artifacts/blind-eval-v0/${artifactId}.json`;
  const before = JSON.parse(fs.readFileSync(artifactPath, 'utf8')).result;
  const after = decode(index.lines);
  const cmp = [
    ['score', before.parseScore, R(after.score)],
    ['chains', before.parseChainCount, after.chains.length],
    ['anchors', before.anchorCount, after.anchors.length],
    ['constraints', before.constraintCount, after.constraints.length],
    ['amounts', before.constraintsPassed, after.constraints.filter((c) => c.passed).length],
  ];
  const ok = cmp.every(([, a, b]) => Math.abs(a - b) < 0.011);
  console.log(`  ${artifactId.padEnd(5)} ${ok ? 'IDENTICAL' : 'DIFFERS'}   ` + cmp.map(([n, a, b]) => `${n} ${a}->${b}`).join('  '));
  process.exit(ok ? 0 : 1);
}

/* ------------------------------------------------- (b) ground-truth trajectory */

// The trajectory the search would have to walk: start at the GT opening anchor,
// then consume the GT transactions in document order, ending at the GT closing.
const signs = [];
let running = 0;
const watchKeys = new Set([`${gt.openingBalance}|0`]);
for (const tx of gt.transactions) {
  const signed = tx.direction === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
  running = R(running + signed);
  signs.push(signed);
  watchKeys.add(`${gt.openingBalance}|${running}`);
}
watchKeys.add(`${gt.openingBalance}|${R(running)}`);

// Sanity: the GT trajectory must end exactly on the GT closing balance. If it does
// not, the ground truth itself is wrong and the trace would be measuring nonsense.
const endsOnClosing = Math.abs(R(gt.openingBalance + running) - gt.closingBalance) <= 0.011;
console.log(`  GT trajectory sanity: opening ${gt.openingBalance} + sum(${signs.length} amounts) = ${R(gt.openingBalance + running)} vs printed closing ${gt.closingBalance} -> ${endsOnClosing ? 'MATCH' : 'MISMATCH'}`);
if (!endsOnClosing) process.exit(3);

const steps = [];
const trace = {
  watchKeys,
  onStep: (step, info) => {
    const hit = info.watched.find((w) => w.presentBefore && w.rankBefore !== null);
    if (hit || info.watched.some((w) => w.presentBefore)) {
      steps.push({ step, ...info, hit: hit ?? null });
    }
  },
};

console.log(`\n${gt.statementId}   beam=${beam}   lines=${index.lines.length}`);
console.log(`  watching ${watchKeys.size} GT-trajectory states: anchor ${gt.openingBalance} + cumulative GT sums`);

const started = Date.now();
const parse = decode(index.lines, { maxStates: beam, trace });
const elapsed = Date.now() - started;

const finalGrowth = steps[steps.length - 1];
console.log(`  decode: ${(elapsed / 1000).toFixed(1)}s   final score ${R(parse.score)}   chains ${parse.chains.length}`);

console.log('\n  last 12 lines where a GT-trajectory state existed in the beam:');
console.log('  step  beamBefore  rankBefore/beam   cutoff      survived   key');
for (const s of steps.slice(-12)) {
  const w = s.watched.filter((x) => x.presentBefore);
  for (const x of w) {
    console.log(
      `  ${String(s.step).padStart(4)}  ${String(s.beamBeforePrune).padStart(10)}  ` +
        `${String(x.rankBefore).padStart(8)}/${String(s.beamAfterPrune).padEnd(7)} ` +
        `${(s.cutoffScore === Number.NEGATIVE_INFINITY ? '   none' : s.cutoffScore.toFixed(1)).padStart(9)}   ` +
        `${(x.survived ? 'YES' : 'NO').padEnd(8)}   ${x.key}`,
    );
  }
}

const lastStep = steps.length ? steps[steps.length - 1] : null;
const deepestKey = lastStep ? lastStep.watched.filter((w) => w.presentBefore).map((w) => w.key) : [];

console.log('');
console.log(`  GT trajectory steps seen in beam: ${steps.length}/${watchKeys.size}`);
console.log(`  deepest GT state reached: ${deepestKey.join(', ') || '(none)'}`);
if (!steps.length) {
  console.log('  EARLIEST FAILURE STAGE: SEARCH_STATE_MODEL_FAILURE (GT trajectory never entered the beam)');
} else if (!finalGrowth?.watched.some((w) => w.survived)) {
  console.log('  EARLIEST FAILURE STAGE: the GT trajectory was PRUNED before the statement ended');
} else {
  console.log('  GT trajectory survived to the end of the document at this beam width');
}
void finalGrowth;
console.log('');
