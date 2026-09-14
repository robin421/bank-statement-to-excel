import { parseDate, type DateOrder, type ParsedDate } from '../parse/date';
import type { PdfToken } from './tokens';

/**
 * Date reading for a token, plus the document-level context needed to interpret it.
 *
 * A date token is only a *candidate* boundary. The brief is explicit that
 * transaction date, value date, reference date and dates embedded in a
 * description must be distinguished, and that is not decidable from the token —
 * it needs the surrounding structure, which the decoder has and this does not.
 */

export interface DateReading {
  raw: string;
  day: number;
  month: number;
  /** null when the source printed no year (e.g. `23.05.` with the year stacked below). */
  year: number | null;
  iso: string | null;
  order: DateOrder;
  /** True when the year had to come from document context rather than the token. */
  inheritedYear: boolean;
}

export function dateReading(token: PdfToken, order: DateOrder = 'DMY', fallbackYear: number | null = null): DateReading | null {
  const text = token.text.trim().replace(/[,;]$/, '');
  if (!text || text.length > 24) return null;

  const parsed: ParsedDate | null = parseDate(text, order, fallbackYear);
  if (!parsed) return null;

  return {
    raw: text,
    day: parsed.day,
    month: parsed.month,
    year: parsed.year,
    iso: parsed.iso,
    order: parsed.order,
    inheritedYear: parsed.year === fallbackYear && fallbackYear !== null && !/\d{4}/.test(text),
  };
}

/**
 * Document-level date order.
 *
 * Reuses the existing inference, which is already tested: a component above 12
 * proves the order, and when nothing proves it the answer is "ambiguous" rather
 * than a silent guess. The UI surfaces that; the decoder must not paper over it.
 */
export function inferOrder(tokens: PdfToken[]): { order: DateOrder; ambiguous: boolean } {
  let mdy = 0;
  let dmy = 0;

  for (const token of tokens) {
    const match = token.text.trim().match(/^(\d{1,2})([/\-.])(\d{1,2})(?:\2(\d{2,4}))?$/);
    if (!match) continue;
    const a = Number.parseInt(match[1], 10);
    const b = Number.parseInt(match[3], 10);
    if (a > 12 && b <= 12) dmy += 1;
    else if (b > 12 && a <= 12) mdy += 1;
  }

  if (dmy > mdy) return { order: 'DMY', ambiguous: false };
  if (mdy > dmy) return { order: 'MDY', ambiguous: false };
  // Statements in the markets we serve overwhelmingly use day-first outside the
  // US, so that is the default — but it is reported as ambiguous, never assumed.
  return { order: 'DMY', ambiguous: true };
}

/** The most common 4-digit year among date-bearing tokens, used to fill stacked dates. */
export function documentYear(tokens: PdfToken[]): number | null {
  const counts = new Map<number, number>();
  for (const token of tokens) {
    for (const match of token.text.matchAll(/\b(19|20)(\d{2})\b/g)) {
      const year = Number.parseInt(`${match[1]}${match[2]}`, 10);
      counts.set(year, (counts.get(year) ?? 0) + 1);
    }
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [year, count] of counts) {
    if (count > bestCount) {
      best = year;
      bestCount = count;
    }
  }
  return best;
}
