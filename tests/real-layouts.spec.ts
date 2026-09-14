import { describe, expect, it } from 'vitest';
import { parseAmount, isAmountLike, normalizeNumeric } from '../src/lib/parse/amount';
import { splitCellTokens } from '../src/lib/parse/tokens';
import { bandForCell, type ColumnBand } from '../src/lib/parse/columns';
import type { TextCell } from '../src/lib/parse/rows';

/**
 * Regressions found by testing real bank statements.
 *
 * Every one of these passed 100% on the synthetic corpus, because the generator
 * drew each column as its own text run and used tidy US/EU money formats. Real
 * PDFs do neither. These tests pin the fixes at the unit level; the corpus test
 * checks they add up.
 */

function cell(str: string, x = 100, w = 200, h = 10): TextCell {
  return { str, x, y: 100, w, h, page: 1 };
}

describe('merged text runs (Sparkasse, Postbank)', () => {
  it('splits a leading date out of a transaction line', () => {
    const parts = splitCellTokens(cell('01.10.2021 Lastschrift -790,00'));
    expect(parts.map((p) => p.str)).toEqual(['01.10.2021', 'Lastschrift', '-790,00']);
  });

  it('splits a two-token date like "01. Okt 2021"', () => {
    const parts = splitCellTokens(cell('01. Okt 2021 Miete -1.200,00'));
    expect(parts[0].str).toBe('01. Okt 2021');
    expect(parts.at(-1)?.str).toBe('-1.200,00');
  });

  it('places the date at the left edge and the amount at the right', () => {
    const [date, , amount] = splitCellTokens(cell('01.10.2021 Lastschrift -790,00', 50, 250));
    // The date starts where the run starts...
    expect(date.x).toBeCloseTo(50, 0);
    // ...and the amount ends where the run ends.
    expect(amount.x + amount.w).toBeCloseTo(300, 0);
  });

  it('leaves a plain description alone', () => {
    const parts = splitCellTokens(cell('Wohngenossenschaft Miete und NK'));
    expect(parts).toHaveLength(1);
    expect(parts[0].str).toBe('Wohngenossenschaft Miete und NK');
  });

  it('does not split a description that merely starts with a number', () => {
    const parts = splitCellTokens(cell('4129-000212 Lohn/Gehalt Abrechnung'));
    expect(parts).toHaveLength(1);
  });
});

describe('Swiss apostrophe thousands separator (Schwyzer Kantonalbank)', () => {
  it('reads 48\'671.25 as a number', () => {
    expect(normalizeNumeric("48'671.25")?.normalized).toBe('48671.25');
    expect(parseAmount("3'477.00")?.value).toBe(3477);
  });

  it('accepts the typographic apostrophe too', () => {
    expect(parseAmount('1\u2019234.56')?.value).toBe(1234.56);
  });

  it('still handles the formats we write ourselves', () => {
    expect(parseAmount('-1.234,56')?.value).toBe(-1234.56);
    expect(parseAmount('12,34,567.89')?.value).toBe(1234567.89);
    expect(parseAmount('1 234,56')?.value).toBe(1234.56);
  });
});

describe('a trailing separator is not a number (Postbank)', () => {
  it('rejects 23.05. rather than reading it as 2305', () => {
    // Postbank prints the year stacked under the date, so the day/month cell
    // arrives as "23.05." — reading that as money cost the whole statement.
    expect(normalizeNumeric('23.05.')).toBeNull();
    expect(parseAmount('23.05.')).toBeNull();
    expect(isAmountLike('23.05.')).toBe(false);
  });

  it('still accepts a leading-dot decimal', () => {
    expect(parseAmount('.50')?.value).toBe(0.5);
  });
});

describe('reference lines must not become amounts', () => {
  it('rejects a payment-slip code line', () => {
    // "26 26060 00000 00000 00000" concatenates into a 19-digit integer. Treated
    // as money it produced a 114pt-wide column band that overlapped the real
    // ones and destroyed the column model.
    expect(isAmountLike('26 26060 00000 00000 00000')).toBe(false);
    expect(isAmountLike('00 00000 00000 11111 00110')).toBe(false);
  });

  it('rejects an absurd magnitude', () => {
    expect(isAmountLike('2626060000000000000.00')).toBe(false);
  });

  it('still accepts a large but real balance', () => {
    expect(isAmountLike('1,234,567.89')).toBe(true);
    expect(isAmountLike('12,34,567.89')).toBe(true);
  });
});

describe('band assignment with overlapping columns', () => {
  const bands: ColumnBand[] = [
    { id: 'a', kind: 'money', left: 100, right: 200, anchor: 200, count: 5 },
    { id: 'b', kind: 'money', left: 150, right: 260, anchor: 260, count: 5 },
  ];

  it('picks the band whose anchor is nearest, not the first that overlaps', () => {
    // A cell sitting in both ranges: its right edge is what identifies it.
    expect(bandForCell(cell('100.00', 130, 70), bands)?.id).toBe('a');
    expect(bandForCell(cell('100.00', 190, 70), bands)?.id).toBe('b');
  });

  it('returns nothing for a cell outside every band', () => {
    expect(bandForCell(cell('x', 10, 10), bands)).toBeUndefined();
  });
});
