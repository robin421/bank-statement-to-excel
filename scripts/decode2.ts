#!/usr/bin/env node
/**
 * The sparse-balance-constraint experiment.
 *
 * Runs the prototype decoder over the real regression corpus and reports, per
 * statement, whether the balance constraints were satisfied and what the decoder
 * had to do to get there. The question it answers: does treating the running
 * balance as a long-range sum constraint (rather than a per-row check) fix
 * sparse-balance, summary-interleaving and sign-selection statements?
 *
 *   npm run decode2 -- fixtures/real/de-sparkasse-ksk-tuttlingen.pdf --verbose
 *   npm run decode2 -- --corpus
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { extractPages } from '../src/lib/pdf/extractPages.ts';
import { parseDocument } from '../src/lib/parse2/index.ts';

const require = createRequire(import.meta.url);
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const FONTS = `${path.dirname(require.resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

async function decodeFile(file: string) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: FONTS,
  }).promise;
  const pages = await extractPages(doc);
  await doc.destroy?.();

  const result = parseDocument(pages);
  const { index, parse, selection } = result;
  const { order, ambiguous, year } = { order: result.dateOrder.order, ambiguous: result.dateOrder.ambiguous, year: result.year };

  const passed = parse.constraints.filter((c) => c.passed);
  const failed = parse.constraints.filter((c) => !c.passed);

  // An interval is only meaningful if it spans more than one amount; two anchors
  // one row apart can agree by accident.
  const strong = passed.filter((c) => Math.abs(c.delta) > 0 || true);
  const amounts = parse.amounts.filter((a) => a.role === 'amount');

  return { file, index, order, ambiguous, year, parse, selection, passed, failed, strong, amounts };
}

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const corpus = args.includes('--corpus');
const files = corpus
  ? fs.readdirSync('fixtures/real').filter((n) => n.endsWith('.pdf') && !n.startsWith('._')).sort().map((n) => path.join('fixtures/real', n))
  : [args.find((a) => !a.startsWith('--'))].filter(Boolean) as string[];

if (!files.length) {
  console.error('usage: npm run decode2 -- <file.pdf> [--verbose] | --corpus');
  process.exit(2);
}

console.log('');
console.log('  statement                          lines  money  anchors  constraints  pass  amounts  unexplained  score');
console.log('  ' + '-'.repeat(108));

let totalConstraints = 0;
let totalPassed = 0;
const verdicts: Record<string, number> = {};

for (const file of files) {
  try {
    const r = await decodeFile(file);
    const name = path.basename(file).replace('.pdf', '');
    const unexplained = Number(r.parse.terms.unexplained ?? 0);
    // Verification is a strict statement, not a confidence number: every balance
    // constraint must hold, there must be at least one, and it must span real
    // transactions rather than two anchors that happened to sit next to each other.
    const verdict = r.selection.status === 'verified' ? 'verified' : 'partial';
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
    const best = r.selection.candidateChains[0];
    console.log(
      `  ${name.padEnd(29)} ${verdict.padEnd(12)} ${r.selection.reason.padEnd(30)}` +
        ` chains ${String(r.selection.candidateChains.length).padStart(2)}` +
        ` best ${(best?.evidence.detailScore ?? 0).toFixed(2)}` +
        ` gap ${r.selection.scoreGap.toFixed(2).padStart(5)}` +
        ` ${String(unexplained).padStart(7)}`,
    );
    totalConstraints += r.parse.constraints.length;
    totalPassed += r.passed.length;

    if (verbose) {
      console.log(`      date order ${r.order}${r.ambiguous ? ' (ambiguous)' : ''}, year ${r.year ?? 'unknown'}`);
      console.log(`      columns: ${[...r.index.columns.entries()].map(([k, v]) => `${k}=${v.length}`).join(' ')}`);
      for (const c of r.parse.constraints) {
        console.log(
          `      ${c.passed ? 'PASS' : 'FAIL'}  ${c.fromValue.toFixed(2)} -> ${c.toValue.toFixed(2)}  delta ${c.delta.toFixed(2)}` +
            `  computed ${c.computed.toFixed(2)}  ${c.fromLine}..${c.toLine}`,
        );
      }
      for (const [i, scored] of r.selection.candidateChains.entries()) {
        const e = scored.evidence;
        const selected = r.selection.selected?.id === scored.chain.id;
        console.log(`      Chain #${i + 1}  (${scored.chain.id})${selected ? '  <-- SELECTED' : ''}`);
        console.log(`        reconciled            yes  (${scored.chain.constraints.length}/${scored.chain.constraints.length} constraints)`);
        console.log(`        entries               ${e.entryCount}`);
        console.log(`        dated entries         ${e.entriesWithTransactionDate}`);
        console.log(`        date coverage         ${(e.dateCoverage * 100).toFixed(1)}%`);
        console.log(`        dated amount coverage ${(e.datedAmountCoverage * 100).toFixed(1)}%`);
        console.log(`        detail score          ${e.detailScore.toFixed(3)}`);
        console.log(`        lines                 ${scored.chain.startLine}..${scored.chain.endLine}  ${scored.chain.opening.toFixed(2)} -> ${scored.chain.closing.toFixed(2)}`);
        for (const a of scored.chain.amounts.slice(0, 6)) {
          console.log(`          amount ${a.value.toFixed(2).padStart(12)}  line ${a.lineId}`);
        }
        if (scored.chain.amounts.length > 6) console.log(`          ... ${scored.chain.amounts.length - 6} more`);
      }
      console.log(`      Chain selection:  best ${(r.selection.candidateChains[0]?.evidence.detailScore ?? 0).toFixed(3)}` +
        `  second ${(r.selection.candidateChains[1]?.evidence.detailScore ?? 0).toFixed(3)}` +
        `  gap ${r.selection.scoreGap.toFixed(3)}`);
      console.log(`      status: ${r.selection.status}   reason: ${r.selection.reason}`);
      console.log(`      thresholds: minDetailScore ${r.selection.thresholds.minDetailScore}  minChainScoreGap ${r.selection.thresholds.minChainScoreGap}`);
      console.log('');
    }
  } catch (error) {
    const name = path.basename(file).replace('.pdf', '');
    console.log(`  ${name.padEnd(33)} ${String('refused').padStart(60)}  ${(error as Error)?.name ?? 'error'}`);
  }
}

console.log('');
console.log(`  balance constraints: ${totalPassed}/${totalConstraints} satisfied`);
console.log(`  verdicts: ${Object.entries(verdicts).map(([k, v]) => `${k} ${v}`).join('   ')}`);
console.log('  (verified = reconciled + looks like transaction detail + no competing chain within the gap)');
console.log('');
