/**
 * Money parsing.
 *
 * Bank statements are hostile to naive parsers: thousands separators differ by
 * locale, negatives appear as parentheses or a trailing minus, Indian grouping
 * uses 2-digit groups, and some banks suffix CR/DR instead of signing at all.
 */

export interface ParsedAmount {
  /** Absolute value, always >= 0. */
  magnitude: number;
  /** Signed value (magnitude applied to the detected sign). */
  value: number;
  negative: boolean;
  currency?: string;
  /** True when the text carried an explicit 2-decimal fraction or a currency symbol. */
  strong: boolean;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '₹': 'INR',
  '¥': 'JPY',
  '₦': 'NGN',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  'R$': 'BRL',
  'A$': 'AUD',
  'C$': 'CAD',
  'S$': 'SGD',
  'HK$': 'HKD',
  'NZ$': 'NZD',
};

const CURRENCY_CODES = /\b(USD|EUR|GBP|INR|AUD|CAD|NZD|SGD|CHF|JPY|ZAR|NGN|HKD|SEK|NOK|DKK|PLN|MXN|BRL|TRY|AED|SAR)\b/i;

const NUMERIC_ONLY = /^[\d.,]+$/;

function detectCurrency(raw: string): string | undefined {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol)) return code;
  }
  const code = raw.match(CURRENCY_CODES);
  return code ? code[1].toUpperCase() : undefined;
}

interface DecimalSplit {
  /** Normalized plain-decimal string, e.g. "1234.56". */
  normalized: string;
  hasFraction: boolean;
}

/**
 * Decide whether the final `,` / `.` in a numeric string is a decimal point or
 * a thousands separator.
 *
 * Rule: exactly two digits after the last separator means it is a decimal point
 * (no currency writes 3 decimal places but groups in 2s or 3s). Anything else
 * means every separator is grouping.
 */
export function normalizeNumeric(raw: string): DecimalSplit | null {
  const s = raw.replace(/\s/g, '');
  if (!s || !/\d/.test(s) || !NUMERIC_ONLY.test(s)) return null;

  const separators = [...s].map((c, i) => (c === '.' || c === ',' ? i : -1)).filter((i) => i >= 0);
  if (!separators.length) return { normalized: s, hasFraction: false };

  const lastIndex = separators[separators.length - 1];
  const digitsAfter = s.length - lastIndex - 1;
  const firstSeparator = separators[0];
  const leadingGroup = firstSeparator;
  const isGrouped = digitsAfter === 3 && (separators.length > 1 || leadingGroup <= 3);

  if (isGrouped) {
    return { normalized: s.replace(/[.,]/g, ''), hasFraction: false };
  }

  const integerPart = s.slice(0, lastIndex).replace(/[.,]/g, '');
  const fractionPart = s.slice(lastIndex + 1);
  if (!integerPart) return null;
  return { normalized: `${integerPart}.${fractionPart}`, hasFraction: true };
}

/**
 * Parse a single cell that should contain one money value.
 * Returns null when the cell is not a single plain number (descriptions, dates,
 * reference numbers with letters, etc.), which is what makes it safe to run
 * across every cell in the document.
 */
export function parseAmount(raw: string): ParsedAmount | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || s.length > 40) return null;

  const currency = detectCurrency(s);
  s = s.replace(/[$£€₹¥₦₩₽₺]/g, ' ');
  s = s.replace(/\b(R\$|A\$|C\$|S\$|HK\$|NZ\$)\b/gi, ' ');
  s = s.replace(new RegExp(CURRENCY_CODES.source, 'gi'), ' ');
  s = s.trim();
  if (!s) return null;

  let negative = false;

  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // CR/DR suffixes are common on Indian and older UK statements.
  const suffix = s.match(/(CR|DR)\.?$/i);
  if (suffix) {
    if (suffix[1].toUpperCase() === 'DR') negative = true;
    s = s.slice(0, suffix.index).trim();
  }

  if (s.startsWith('-') || s.startsWith('−') || s.startsWith('–')) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) {
    s = s.slice(1).trim();
  }

  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  s = s.replace(/\s/g, '');
  const split = normalizeNumeric(s);
  if (!split) return null;

  const magnitude = Number.parseFloat(split.normalized);
  if (!Number.isFinite(magnitude)) return null;

  return {
    magnitude: Math.abs(magnitude),
    value: negative ? -Math.abs(magnitude) : Math.abs(magnitude),
    negative,
    currency,
    strong: split.hasFraction || Boolean(currency),
  };
}

/** Does this text look like it is entirely one money value? */
export function isAmountLike(raw: string): boolean {
  const parsed = parseAmount(raw);
  if (!parsed) return false;
  // Reject bare small integers: they are overwhelmingly row numbering, cheque
  // numbers and page numbers rather than transaction amounts.
  if (!parsed.strong && parsed.magnitude < 1000) return false;
  return true;
}

/** Format a number for spreadsheet output without locale surprises. */
export function toDecimalString(value: number, fractionDigits = 2): string {
  return value.toFixed(fractionDigits);
}
