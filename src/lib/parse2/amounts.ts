import { parseAmount } from '../parse/amount';
import { parseDate } from '../parse/date';
import type { PdfToken } from './tokens';

/**
 * Money reading for a token.
 *
 * Deliberately says nothing about columns, signs or roles — whether a value is a
 * transaction amount, a running balance or a subtotal is decided by the decoder
 * using arithmetic, not here.
 *
 * The hard part is not reading a number, it is deciding which numbers on a
 * statement are money at all. A real Sparkasse page contains reference numbers,
 * IBAN fragments, dates and phone numbers, and treating them all as candidate
 * amounts produced a sequence where most tokens were noise:
 *
 *     5879214685746   "reference"
 *     20.10.2021      parsed as the amount 2010.20
 *     2021            a year
 *     9405, 9421      IBAN fragments
 *
 * So this returns *evidence and a confidence* rather than a boolean. The decoder
 * has to explain high-confidence tokens; it may discard low-confidence ones at a
 * cost. Deciding here would just move the guess.
 */

export interface MoneyEvidence {
  /** A decimal fraction is printed. Statement amounts almost always have one. */
  hasDecimal: boolean;
  /** An explicit minus, parentheses, or a DR marker. */
  hasSign: boolean;
  hasCurrency: boolean;
  /** No sign, no currency, no decimal: usually a reference, not an amount. */
  bareInteger: boolean;
  /** Looks like a year (1900–2100) — a date component more often than money. */
  yearLike: boolean;
  digits: number;
}

export interface MoneyReading {
  /** As printed. Parentheses, a trailing minus and `DR` all produce a negative. */
  value: number;
  magnitude: number;
  decimals: number;
  currency?: string;
  evidence: MoneyEvidence;
  /** 0..1. Lexical only; document context is added in the candidate layer. */
  confidence: number;
}

const MAX_MAGNITUDE = 1e13;
const MAX_DIGITS = 15;

const CURRENCY_CODES = /\b(?:CR|DR|USD|EUR|GBP|INR|CHF|AUD|CAD|NZD|SGD|JPY|ZAR|NGN|HKD|SEK|NOK|DKK|PLN|MXN|BRL|TRY|AED|SAR)\b/gi;

export function moneyReading(token: PdfToken): MoneyReading | null {
  const text = token.text.trim().replace(/[,;:]$/, '');
  if (!text || text.length > 40) return null;

  // A token that reads as a date is a date. `20.10.2021` parsed as 2010.20 and
  // put date columns into the money sequence, which is fatal for the decoder.
  if (parseDate(text, 'DMY', null) || parseDate(text, 'MDY', null)) return null;

  // Letters disqualify, except currency codes and CR/DR markers.
  if (/[A-Za-z]/.test(text.replace(CURRENCY_CODES, ''))) return null;

  const parsed = parseAmount(text);
  if (!parsed) return null;

  const digits = (text.match(/\d/g) ?? []).length;
  if (digits > MAX_DIGITS || parsed.magnitude >= MAX_MAGNITUDE) return null;
  if (parsed.magnitude === 0) return null;

  const signless = text.replace(/[)\s]*(?:CR|DR)?$/i, '');
  const hasDecimal = /[.,]\d{1,2}$/.test(signless);
  const hasSign = parsed.negative || /^[-+(]/.test(text);
  const hasCurrency = Boolean(parsed.currency);
  const bareInteger = !hasDecimal && !hasSign && !hasCurrency;
  const yearLike = digits === 4 && parsed.magnitude >= 1900 && parsed.magnitude <= 2100;

  let confidence = 0.15;
  if (hasDecimal) confidence += 0.4;
  if (hasSign) confidence += 0.2;
  if (hasCurrency) confidence += 0.15;
  if (bareInteger) confidence -= 0.45;
  if (yearLike) confidence -= 0.35;
  // Long bare digit runs are account and reference numbers.
  if (bareInteger && digits >= 6) confidence -= 0.3;

  return {
    value: parsed.value,
    magnitude: parsed.magnitude,
    decimals: hasDecimal ? 2 : 0,
    currency: parsed.currency,
    evidence: { hasDecimal, hasSign, hasCurrency, bareInteger, yearLike, digits },
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export interface MoneyCandidate {
  token: PdfToken;
  reading: MoneyReading;
  /** Right edge, the alignment signal for figures. */
  right: number;
  /** Set when this token sits in a column with other figures. */
  columnId?: string;
  /**
   * Confidence after document context. A figure that lines up with many others is
   * far more likely to be an amount; an isolated number in prose is not.
   */
  confidence: number;
}

/**
 * Candidate generation for money tokens.
 *
 * Alignment is used as *evidence*, never as a hard admission rule: the brief is
 * explicit that requiring a column to have at least two members discards real
 * mutually-exclusive debit/credit columns, where one side may be empty on many
 * rows. So a token with no column is kept, just with lower confidence.
 */
export function moneyCandidates(tokens: PdfToken[], linePitch: number, medianFontSize: number): MoneyCandidate[] {
  const monetary: MoneyCandidate[] = [];
  for (const token of tokens) {
    const reading = moneyReading(token);
    if (!reading) continue;
    monetary.push({ token, reading, right: token.x + token.width, confidence: reading.confidence });
  }

  // Cluster right edges. Tolerance scales with the font: figures in one column
  // align to within a fraction of a character, and that fraction is a property of
  // the typeface, not of the bank.
  const tolerance = Math.max(1.5, medianFontSize * 0.35);
  const clusters: Array<{ centre: number; members: MoneyCandidate[] }> = [];
  for (const candidate of [...monetary].sort((a, b) => a.right - b.right)) {
    const cluster = clusters.find((entry) => Math.abs(entry.centre - candidate.right) <= tolerance);
    if (cluster) {
      cluster.members.push(candidate);
      cluster.centre = cluster.members.reduce((sum, member) => sum + member.right, 0) / cluster.members.length;
    } else {
      clusters.push({ centre: candidate.right, members: [candidate] });
    }
  }

  clusters.forEach((cluster, index) => {
    const id = `c${index}`;
    // A populated column of figures is strong evidence; a lone aligned value is not.
    const support = Math.min(1, cluster.members.length / 6);
    for (const member of cluster.members) {
      member.columnId = id;
      member.confidence = Math.min(1, member.confidence + support * 0.45);
    }
  });

  void linePitch;
  return monetary;
}
