#!/usr/bin/env node
/**
 * Blind evaluation v0 — single-file worker.
 *
 * Runs the FROZEN parser on one statement and writes the raw result. Spawned by
 * blind-eval-v0.mjs in a child process so a hang can be enforced as a timeout
 * rather than worked around. Nothing here may change parser behaviour: it only
 * imports the frozen modules and records what they do.
 *
 *   npx vite-node scripts/blind-eval-one.mjs -- <id> <pdfPath> <outPath>
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

const [id, pdfPath, outPath] = process.argv.slice(2).filter((a) => a !== '--');

const record = {
  id,
  pdfPath,
  termination: 'completed',
  durationMs: 0,
  /* Search diagnostics. Internal beam counters (statesExpanded / statesPruned)
     are NOT instrumented: adding them would mean editing the frozen parser. What
     is recorded here is everything observable from outside it. */
  diagnosticsNote: 'beam internals not instrumented; frozen parser was not modified',
  result: null,
  error: null,
};

const started = Date.now();

try {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(pdfPath)),
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl: FONTS,
  }).promise;

  const pages = await extractPages(doc);
  await doc.destroy?.();

  const parsed = parseDocument(pages);
  const { selection, parse } = parsed;

  const summarise = (chain) => ({
    id: chain.id,
    opening: chain.opening,
    closing: chain.closing,
    constraints: chain.constraints.length,
    amounts: chain.amounts.length,
    amountValues: chain.amounts.map((a) => a.value),
    startLine: chain.startLine,
    endLine: chain.endLine,
  });

  record.result = {
    status: selection.status,
    reason: selection.reason,
    scoreGap: Number.isFinite(selection.scoreGap) ? selection.scoreGap : null,
    thresholds: selection.thresholds,
    selectedChain: selection.selected ? summarise(selection.selected) : null,
    candidateChains: selection.candidateChains.map((entry) => ({
      ...summarise(entry.chain),
      detailScore: Number(entry.evidence.detailScore.toFixed(4)),
      dateCoverage: Number(entry.evidence.dateCoverage.toFixed(4)),
      datedAmountCoverage: Number(entry.evidence.datedAmountCoverage.toFixed(4)),
      entryCount: entry.evidence.entryCount,
      entriesWithTransactionDate: entry.evidence.entriesWithTransactionDate,
      selected: selection.selected?.id === entry.chain.id,
    })),
    /* Chains the decoder produced that selection discarded — needed to tell
       "the correct chain was never generated" from "it was generated and not
       chosen". */
    parseChainCount: parse.chains.length,
    alternativeChainCount: parse.alternatives.length,
    parseScore: Number(parse.score.toFixed(2)),
    terms: parse.terms,
    anchorCount: parse.anchors.length,
    constraintCount: parse.constraints.length,
    constraintsPassed: parse.constraints.filter((c) => c.passed).length,
    dateOrder: parsed.dateOrder,
    year: parsed.year,
    pages: parsed.index.graph.tokens.length ? pages.length : pages.length,
    lines: parsed.index.lines.length,
    tokens: parsed.index.graph.tokens.length,
    moneyCandidates: parsed.index.lines.reduce((n, line) => n + line.money.length, 0),
    maxMoneyPerLine: Math.max(0, ...parsed.index.lines.map((line) => line.money.length)),
  };
} catch (error) {
  record.termination = 'completed';
  record.error = { name: error?.name ?? 'Error', code: error?.code ?? null, message: String(error?.message ?? error) };
}

record.durationMs = Date.now() - started;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
