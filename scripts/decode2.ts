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
import { buildLines } from '../src/lib/parse2/lines.ts';
import { decode } from '../src/lib/parse2/decode.ts';
import { documentYear, inferOrder } from '../src/lib/parse2/dates.ts';

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

  const index = buildLines(pages);
  const { order, ambiguous } = inferOrder(index.graph.tokens);
  const year = documentYear(index.graph.tokens);
  const parse = decode(index.lines);

  const passed = parse.constraints.filter((c) => c.passed);
  const failed = parse.constraints.filter((c) => !c.passed);

  // An interval is only meaningful if it spans more than one amount; two anchors
  // one row apart can agree by accident.
  const strong = passed.filter((c) => Math.abs(c.delta) > 0 || true);
  const amounts = parse.amounts.filter((a) => a.role === 'amount');

  return { file, index, order, ambiguous, year, parse, passed, failed, strong, amounts };
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
    const spans = r.passed.reduce((sum, c) => sum + c.spans, 0);
    const contradictions = r.parse.terms.contradictions;
    const verdict =
      r.parse.constraints.length === 0
        ? 'unsupported'
        : contradictions > 0
          ? 'partial'
          : spans >= 2
            ? 'verified'
            : 'unsupported';
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
    console.log(
      `  ${name.padEnd(29)} ${verdict.padEnd(12)} ${String(r.parse.anchors.length).padStart(7)}` +
        ` ${String(r.parse.constraints.length).padStart(12)} ${String(r.passed.length).padStart(5)}` +
        ` ${String(spans).padStart(6)} ${String(r.amounts.length).padStart(8)} ${String(unexplained).padStart(12)}`,
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
      for (const a of r.parse.amounts) {
        console.log(`      ${a.role === 'anchor' ? 'anchor' : 'amount'}  ${a.value.toFixed(2).padStart(12)}  ${JSON.stringify(a.token.text)}`);
      }
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
console.log('');
