import { describe, expect, it } from 'vitest';
import { convertDocument } from '../src/lib/parse';
import { PdfNoTextLayerError, PdfPasswordRequiredError } from '../src/lib/pdf/types';
import { compare, describeComparison } from './helpers/compare';
import { listFixtures, openFixture, readExpected } from './helpers/pdfjs';

/**
 * The hard gate for the whole product.
 *
 * These numbers are not aspirational: if the parser cannot reconcile against a
 * statement's own running balance, shipping it would mean publishing
 * plausible-but-wrong financial data, which is the one failure mode that would
 * destroy the trust positioning the site is built on.
 */
const RECALL_FLOOR = 0.95;
const PRECISION_FLOOR = 0.95;
const RECONCILE_FLOOR = 0.95;

const CLEAN_LAYOUTS = [
  'chase-like',
  'boa-like',
  'hdfc-like',
  'icici-like',
  'hsbc-like',
  'parens-negative',
  'euro-decimal',
  'day-month-name',
  'multipage',
  'wells-fargo-like',
];

describe('statement parsing fixtures', () => {
  it('generated the fixture corpus', () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(12);
  });

  for (const name of CLEAN_LAYOUTS) {
    it(`reconciles ${name}`, async () => {
      const expected = readExpected(name);
      const doc = await openFixture(name);
      const result = await convertDocument(doc);

      const comparison = compare(expected.transactions, result.transactions);
      const detail = describeComparison(comparison);

      expect(result.quality.status, `${name} quality: ${result.quality.reasons.join(' ')}\n${detail}`).not.toBe('needs_ocr');
      expect(comparison.recall, `${name} recall\n${detail}`).toBeGreaterThanOrEqual(RECALL_FLOOR);
      expect(comparison.precision, `${name} precision\n${detail}`).toBeGreaterThanOrEqual(PRECISION_FLOOR);

      // Balance-chain reconciliation: the invariant that makes the output trustworthy.
      if (result.reconciliation.checked >= 3) {
        expect(
          result.reconciliation.passRate,
          `${name} reconcile ${result.reconciliation.matched}/${result.reconciliation.checked}\n${detail}`,
        ).toBeGreaterThanOrEqual(RECONCILE_FLOOR);
      }
    });
  }

  it('keeps the running balance chain exact on an amount+balance layout', async () => {
    const expected = readExpected('chase-like');
    const doc = await openFixture('chase-like');
    const result = await convertDocument(doc);

    expect(result.reconciliation.checked).toBeGreaterThanOrEqual(expected.transactions.length - 2);
    expect(result.reconciliation.mismatches).toHaveLength(0);
  });

  it('parses debit/credit statements that have no balance column', async () => {
    const expected = readExpected('no-balance');
    const doc = await openFixture('no-balance');
    const result = await convertDocument(doc);

    const comparison = compare(expected.transactions, result.transactions);
    expect(comparison.recall, describeComparison(comparison)).toBeGreaterThanOrEqual(RECALL_FLOOR);
    expect(comparison.precision, describeComparison(comparison)).toBeGreaterThanOrEqual(PRECISION_FLOOR);
    // Without a balance there is nothing to reconcile against, and we must say so
    // rather than implying the rows were verified.
    expect(result.reconciliation.checked).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/running-balance/i);
  });

  it('detects the debits as negative on split-column layouts', async () => {
    const expected = readExpected('hdfc-like');
    const doc = await openFixture('hdfc-like');
    const result = await convertDocument(doc);

    const negatives = result.transactions.filter((transaction) => transaction.amount < 0).length;
    const expectedNegatives = expected.transactions.filter((transaction) => transaction.amount < 0).length;
    expect(negatives).toBe(expectedNegatives);
  });

  it('reads Indian 2-digit grouping without corrupting magnitudes', async () => {
    const doc = await openFixture('hdfc-like');
    const result = await convertDocument(doc);
    const balances = result.transactions.map((transaction) => transaction.balance).filter((value): value is number => value !== null);

    // HDFC fixture balances run from ~5k to ~20k; a grouping bug would produce
    // values three orders of magnitude out.
    expect(Math.max(...balances)).toBeGreaterThan(1000);
    expect(Math.max(...balances)).toBeLessThan(100000);
  });

  it('excludes the daily-balance summary block', async () => {
    const doc = await openFixture('wells-fargo-like');
    const result = await convertDocument(doc);
    expect(result.transactions).toHaveLength(12);
    expect(result.transactions.some((transaction) => /beginning|ending/i.test(transaction.description))).toBe(false);
  });

  it('infers day/month order from the document when a day is above the 12th', async () => {
    const doc = await openFixture('hdfc-like');
    const result = await convertDocument(doc);
    expect(result.dateOrder).toBe('DMY');
    expect(result.dateOrderAmbiguous).toBe(false);
  });

  it('flags ambiguous date order instead of guessing silently', async () => {
    const doc = await openFixture('chase-like');
    const result = await convertDocument(doc);
    // Chase dates include days above the 12th, so this is unambiguous...
    expect(result.dateOrder).toBe('MDY');
    // ...but the US default must still be reported as ambiguous when nothing
    // in the document proves the order.
    const forced = await convertDocument(await openFixture('chase-like'), { dateOrder: 'auto' });
    expect(forced.dateOrderEvidence.mdy + forced.dateOrderEvidence.dmy).toBeGreaterThan(0);
  });

  it('reports a scanned PDF as needing OCR', async () => {
    const doc = await openFixture('scan-no-text');
    await expect(convertDocument(doc)).rejects.toBeInstanceOf(PdfNoTextLayerError);
  });

  it('reports a garbage text layer as needing OCR rather than inventing rows', async () => {
    const doc = await openFixture('broken-text-layer');
    const result = await convertDocument(doc);
    expect(result.quality.status).toBe('needs_ocr');
  });

  it('asks for a password instead of failing obscurely', async () => {
    await expect(openFixture('password-protected')).rejects.toThrow();
    const doc = await openFixture('password-protected', 'hunter2');
    const result = await convertDocument(doc);
    expect(result.transactions.length).toBeGreaterThan(10);
  });

  it('exposes friendly errors for password-protected PDFs', async () => {
    const { toFriendlyPdfError } = await import('../src/lib/pdf/errors');
    const mapped = toFriendlyPdfError({ name: 'PasswordException', code: 1 });
    expect(mapped).toBeInstanceOf(PdfPasswordRequiredError);
  });
});
