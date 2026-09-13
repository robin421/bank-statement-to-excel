import type { DigitGrouping, ExportLocale } from './locales';

/**
 * Number formatting for a target locale.
 *
 * The rule that matters: **exported data never carries thousands separators.**
 * A German CSV amount is `-1234,56`, not `-1.234,56`. Grouping separators break
 * importers (and French ones are a space, which would split the field in any
 * comma-and-quote parser). Grouping is therefore display-only, and the two paths
 * are separate functions so they cannot be confused.
 */

function groupInteger(digits: string, locale: ExportLocale): string {
  if (locale.grouping === 'indian') return groupIndian(digits, locale.thousands);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, locale.thousands);
}

/** 1234567 -> 12,34,567 (lakh, crore). */
function groupIndian(digits: string, separator: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, separator)}${separator}${last3}`;
}

export interface AmountFormatOptions {
  /** Decimal places. Statements and importers both want 2. */
  digits?: number;
  /** Group the integer part for reading. Off for anything machine-parsed. */
  group?: boolean;
  /** Return '' instead of '0.00' — used for empty debit/credit cells. */
  blankZero?: boolean;
}

/**
 * Format an amount for the target locale.
 * `group: true` for on-screen preview, `group: false` (the default) for export.
 */
export function formatAmountLocale(
  value: number | null | undefined,
  locale: ExportLocale,
  options: AmountFormatOptions = {},
): string {
  const { digits = 2, group = false, blankZero = false } = options;
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  if (value === 0 && blankZero) return '';

  const negative = value < 0;
  const [integer, fraction] = Math.abs(value).toFixed(digits).split('.');
  const intPart = group ? groupInteger(integer, locale) : integer;
  const fractionPart = digits > 0 ? `${locale.decimal}${fraction}` : '';

  return `${negative ? '-' : ''}${intPart}${fractionPart}`;
}

/** Plain machine-readable amount: locale decimal separator, never grouped. */
export function formatAmountPlain(value: number | null | undefined, locale: ExportLocale): string {
  return formatAmountLocale(value, locale, { group: false });
}

/** Grouped amount for humans: matches what their spreadsheet will show. */
export function formatAmountDisplay(value: number | null | undefined, locale: ExportLocale): string {
  return formatAmountLocale(value, locale, { group: true, blankZero: true });
}

/**
 * A worked example of this locale's convention, for the format picker.
 * Users recognise `1.234,56` far faster than the phrase "comma decimal".
 */
export function localeSample(locale: ExportLocale): string {
  return formatAmountLocale(1234567.89, locale, { group: true });
}
