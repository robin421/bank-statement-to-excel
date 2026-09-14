import { describe, expect, it } from 'vitest';
import type { LineEvent } from '../src/lib/parse2/lines';
import type { PdfToken } from '../src/lib/parse2/tokens';
import type { MoneyCandidate } from '../src/lib/parse2/amounts';
import type { MoneyReading } from '../src/lib/parse2/amounts';
import type { ReconciledChain } from '../src/lib/parse2/decode';
import type { BalanceConstraint } from '../src/lib/parse2/decode';
import { chainEvidence } from '../src/lib/parse2/chain-selection/evidence';
import {
  DEFAULT_MIN_CHAIN_SCORE_GAP,
  DEFAULT_MIN_DETAIL_SCORE,
  selectChain,
} from '../src/lib/parse2/chain-selection/select';

/**
 * Chain selection regression tests.
 *
 * The architecture claim under test:
 *
 *   reconciliation  asks whether a reading is financially self-consistent
 *   selection       asks whether it is the transaction detail the user wants
 *
 * A statement can satisfy the first for two different readings at once, so the
 * second has to be a separate judgement. Commerce Bank's sample is the real case:
 * `7126.11 + 3615.08 − 20.00 − 200.00 = 10521.19` balances exactly and contains no
 * transactions at all.
 *
 * These fixtures are built directly as line events so the ground truth is exact
 * and the test says what it means.
 */

let tokenCounter = 0;
function token(text: string, line: LineEvent, x = 400, width = 40): PdfToken {
  tokenCounter += 1;
  return {
    id: `t${tokenCounter}`,
    page: 1,
    text,
    x,
    y: line.y,
    width,
    height: 10,
    x1: x,
    y1: line.y - 8,
    x2: x + width,
    y2: line.y + 2,
    fontSize: 10,
    order: tokenCounter,
    runId: `run${tokenCounter}`,
    estimated: false,
  };
}

interface LineSpec {
  text: string;
  amount?: number;
  date?: boolean;
}

function buildLines(specs: LineSpec[]): LineEvent[] {
  const lines: LineEvent[] = [];
  specs.forEach((spec, index) => {
    const line: LineEvent = {
      id: `L${index}`,
      page: 1,
      y: 100 + index * 14,
      tokens: [],
      money: [],
      dateTokens: [],
      descriptionTokens: [],
    };
    if (spec.date) {
      const dateToken = token('01/15/2013', line, 60);
      line.tokens.push(dateToken);
      line.dateTokens.push(dateToken);
    }
    const label = token(spec.text, line, 150, 200);
    line.tokens.push(label);
    line.descriptionTokens.push(label);
    if (spec.amount !== undefined) {
      const amountToken = token(String(spec.amount), line);
      line.tokens.push(amountToken);
      const reading: MoneyReading = {
        value: spec.amount,
        magnitude: Math.abs(spec.amount),
        decimals: 2,
        evidence: { hasDecimal: true, hasSign: spec.amount < 0, hasCurrency: false, bareInteger: false, yearLike: false, digits: 5 },
        confidence: 1,
      };
      const candidate: MoneyCandidate = { token: amountToken, reading, right: amountToken.x + amountToken.width, confidence: 1, columnSupport: 1 };
      line.money.push(candidate);
    }
    lines.push(line);
  });
  return lines;
}

function constraint(passed = true): BalanceConstraint {
  return { fromLine: 'L0', toLine: 'L1', fromValue: 0, toValue: 0, delta: 0, computed: 0, passed, spans: 1, evidenceQuality: 1 };
}

function chain(id: string, lines: LineEvent[], amounts: Array<{ lineIndex: number; value: number }>): ReconciledChain {
  return {
    id,
    anchors: [],
    constraints: [constraint()],
    amounts: amounts.map((entry) => ({
      token: lines[entry.lineIndex].money[0].token,
      value: entry.value,
      role: 'amount' as const,
      lineId: lines[entry.lineIndex].id,
    })),
    opening: 0,
    closing: 0,
    startLine: lines[amounts[0].lineIndex].id,
    endLine: lines[amounts[amounts.length - 1].lineIndex].id,
    pageStart: 1,
    pageEnd: 1,
  };
}

describe('Test 1 — summary versus detail', () => {
  // A summary block and a dated ledger, each a valid explanation of the same
  // opening and closing balance.
  const lines = buildLines([
    { text: 'Beginning Balance', amount: 7126.11 },
    { text: 'Deposits', amount: 3615.08 },
    { text: 'ATM Withdrawals', amount: -20.0 },
    { text: 'Checks Paid', amount: -200.0 },
    { text: 'Ending Balance', amount: 10521.19 },
    { text: 'Deposit', amount: 3615.08, date: true },
    { text: 'ATM withdrawal', amount: -20.0, date: true },
    { text: 'Check 1042', amount: -200.0, date: true },
  ]);

  const summary = chain('summary', lines, [
    { lineIndex: 1, value: 3615.08 },
    { lineIndex: 2, value: -20.0 },
    { lineIndex: 3, value: -200.0 },
  ]);
  const detail = chain('detail', lines, [
    { lineIndex: 5, value: 3615.08 },
    { lineIndex: 6, value: -20.0 },
    { lineIndex: 7, value: -200.0 },
  ]);

  it('scores the summary chain as containing no transaction detail', () => {
    expect(chainEvidence(summary, lines).dateCoverage).toBe(0);
    expect(chainEvidence(summary, lines).datedAmountCoverage).toBe(0);
  });

  it('scores the detail chain as fully dated', () => {
    expect(chainEvidence(detail, lines).dateCoverage).toBe(1);
    expect(chainEvidence(detail, lines).datedAmountCoverage).toBe(1);
  });

  it('selects the detail chain and calls the result verified', () => {
    const result = selectChain([summary, detail], lines);
    expect(result.status).toBe('verified');
    expect(result.reason).toBe('CLEAR_DETAIL_CHAIN');
    expect(result.selected?.id).toBe('detail');
    expect(result.scoreGap).toBeGreaterThanOrEqual(DEFAULT_MIN_CHAIN_SCORE_GAP);
  });

  it('does not let the summary win on arithmetic', () => {
    // Both chains reconcile. If arithmetic leaked into selection, the chain with
    // more constraints would win regardless of structure.
    const richerSummary = { ...summary, constraints: [constraint(), constraint(), constraint()] };
    expect(selectChain([richerSummary, detail], lines).selected?.id).toBe('detail');
  });
});

describe('Test 2 — two equally plausible chains', () => {
  const lines = buildLines([
    { text: 'Opening', amount: 100 },
    { text: 'Alpha', amount: 10, date: true },
    { text: 'Beta', amount: 20, date: true },
    { text: 'Gamma', amount: 30, date: true },
    { text: 'Delta', amount: 40, date: true },
  ]);

  it('reports partial rather than picking one at random', () => {
    const a = chain('a', lines, [
      { lineIndex: 1, value: 10 },
      { lineIndex: 2, value: 20 },
    ]);
    const b = chain('b', lines, [
      { lineIndex: 3, value: 30 },
      { lineIndex: 4, value: 40 },
    ]);
    const result = selectChain([a, b], lines);
    expect(result.status).toBe('partial');
    expect(result.reason).toBe('AMBIGUOUS_RECONCILED_CHAINS');
    expect(result.scoreGap).toBeLessThan(DEFAULT_MIN_CHAIN_SCORE_GAP);
  });

  it('keeps every competing chain so a caller can show them', () => {
    const a = chain('a', lines, [{ lineIndex: 1, value: 10 }]);
    const b = chain('b', lines, [{ lineIndex: 3, value: 30 }]);
    const result = selectChain([a, b], lines);
    expect(result.candidateChains.map((entry) => entry.chain.id)).toEqual(['a', 'b']);
    expect(result.candidateChains[0].evidence).toBeDefined();
  });

  it('is deterministic — the same input gives the same choice', () => {
    const a = chain('a', lines, [{ lineIndex: 1, value: 10 }]);
    const b = chain('b', lines, [{ lineIndex: 3, value: 30 }]);
    expect(selectChain([a, b], lines).selected?.id).toBe(selectChain([b, a], lines).selected?.id);
  });
});

describe('Test 3 — a summary block that carries a date', () => {
  // A statement-period date in the header must not make an undated summary block
  // look like a dated ledger.
  const lines = buildLines([
    { text: 'Statement period 01/01/2013 to 03/31/2013', date: true },
    { text: 'Beginning Balance', amount: 7126.11 },
    { text: 'Deposits', amount: 3615.08 },
    { text: 'Checks Paid', amount: -200.0 },
    { text: 'Ending Balance', amount: 10521.19 },
  ]);

  it('does not award near-full coverage for a single stray date', () => {
    // Deposits is line 2, Checks Paid is line 3; line 1 is the opening balance.
    const summary = chain('summary', lines, [
      { lineIndex: 2, value: 3615.08 },
      { lineIndex: 3, value: -200.0 },
    ]);
    const evidence = chainEvidence(summary, lines);
    // The header date sits above the first amount, and the amount lines
    // themselves are undated, so coverage must stay at zero.
    expect(evidence.dateCoverage).toBe(0);
    expect(evidence.detailScore).toBeLessThan(DEFAULT_MIN_DETAIL_SCORE);
  });
});

describe('Test 4 — a ledger with sparse dates', () => {
  // A multi-line entry: the date is on the first line, the amount on a
  // continuation line. Coverage must not demand a date on every amount, or every
  // multi-line statement would be rejected.
  const lines = buildLines([
    { text: 'Opening Balance', amount: 1000 },
    { text: 'Card payment', date: true },
    { text: 'MERCHANT NAME REF 123', amount: -25.5 },
    { text: 'Interest paid', amount: 1.25 },
    { text: 'Closing Balance', amount: 975.75 },
  ]);

  it('counts an amount as dated when its entry began on a dated line', () => {
    const detail = chain('detail', lines, [
      { lineIndex: 2, value: -25.5 },
      { lineIndex: 3, value: 1.25 },
    ]);
    const evidence = chainEvidence(detail, lines);
    expect(evidence.entriesWithTransactionDate).toBe(1);
    expect(evidence.dateCoverage).toBe(0.5);
    expect(evidence.dateCoverage).toBeLessThan(1);
  });

  it('still selects a partly dated chain over an undated one', () => {
    const detail = chain('detail', lines, [
      { lineIndex: 2, value: -25.5 },
      { lineIndex: 3, value: 1.25 },
    ]);
    const summary = chain('summary', lines, [{ lineIndex: 3, value: 1.25 }]);
    const result = selectChain([summary, detail], lines);
    expect(result.status).toBe('verified');
    expect(result.selected?.id).toBe('detail');
  });
});

describe('Test 5 — a single reconciled chain', () => {
  it('verifies when the detail evidence is sufficient', () => {
    const lines = buildLines([
      { text: 'Deposit', amount: 500, date: true },
      { text: 'Fee', amount: -5, date: true },
    ]);
    const only = chain('only', lines, [
      { lineIndex: 0, value: 500 },
      { lineIndex: 1, value: -5 },
    ]);
    const result = selectChain([only], lines);
    expect(result.status).toBe('verified');
    expect(result.reason).toBe('CLEAR_DETAIL_CHAIN');
  });

  it('refuses a single chain that shows no sign of being a ledger', () => {
    const lines = buildLines([
      { text: 'Category A', amount: 100 },
      { text: 'Category B', amount: -40 },
    ]);
    const only = chain('only', lines, [
      { lineIndex: 0, value: 100 },
      { lineIndex: 1, value: -40 },
    ]);
    const result = selectChain([only], lines);
    expect(result.status).toBe('partial');
    expect(result.reason).toBe('INSUFFICIENT_DETAIL_EVIDENCE');
  });

  it('refuses a chain whose constraints did not all pass', () => {
    const lines = buildLines([{ text: 'X', amount: 10, date: true }]);
    const broken = { ...chain('broken', lines, [{ lineIndex: 0, value: 10 }]), constraints: [constraint(false)] };
    const result = selectChain([broken], lines);
    expect(result.status).toBe('partial');
    expect(result.reason).toBe('NO_RECONCILED_CHAIN');
  });
});

describe('Corpus finding — the Commerce Bank specimen is internally inconsistent', () => {
  /**
   * Recorded because it invalidates the case as a target.
   *
   * The summary block balances exactly, and the detail block's checks total 305.00
   * against a summary that counts 200.00. So there is no transaction ledger that
   * reproduces the printed ending balance, and "make Commerce Bank select the detail
   * chain" is not a solvable problem — there is no consistent detail chain to select.
   *
   * This is a fact about the document, independent of the PDF, so it is asserted
   * here rather than left as a comment.
   */
  const begin = 7126.11;
  const deposits = 3615.08;
  const atm = 20.0;
  const summaryChecks = 200.0;
  const printedEnding = 10521.19;
  const detailChecks = 75.0 + 30.0 + 200.0;

  it('confirms the summary block is self-consistent', () => {
    expect(begin + deposits - atm - summaryChecks).toBeCloseTo(printedEnding, 2);
  });

  it('confirms the detail block is not consistent with the summary', () => {
    expect(begin + deposits - atm - detailChecks).not.toBeCloseTo(printedEnding, 2);
    expect(detailChecks - summaryChecks).toBeCloseTo(105.0, 2);
  });

  it('confirms the printed detail total matches its own detail rows', () => {
    // 75 + 30 + 200 = 305, so the detail block is internally consistent and simply
    // disagrees with the category figure the summary uses.
    expect(detailChecks).toBeCloseTo(305.0, 2);
  });
});
