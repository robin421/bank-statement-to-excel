/**
 * Date parsing for statement cells.
 *
 * The hard part is not parsing — it is that `03/04/2025` is a different day in
 * the US and the UK, and both appear on real statements. We infer the order from
 * the whole document (>12 in a slot is proof) and expose the ambiguity so the UI
 * can offer an override rather than silently guessing.
 */

export type DateOrder = 'MDY' | 'DMY' | 'YMD';

export interface ParsedDate {
  /** 4-digit year, or null when the statement only printed day/month. */
  year: number | null;
  month: number;
  day: number;
  order: DateOrder;
  /** ISO yyyy-mm-dd, or the best partial form when the year is unknown. */
  iso: string;
}

export interface DateOrderGuess {
  order: DateOrder;
  /** True when nothing in the document disambiguated MDY from DMY. */
  ambiguous: boolean;
  evidence: { mdy: number; dmy: number };
}

/**
 * Month names across the markets this tool serves.
 *
 * Keys are lower-cased and stripped of diacritics, so `Okt`, `okt`, `mär` and
 * `déc` all resolve without listing every accented spelling. Restricting this to
 * English was a real bug: a German statement printing `01. Okt 2021` parsed to
 * no date at all, and therefore to no rows.
 *
 * The abbreviations do not collide across languages — `mar` is March in English,
 * Spanish and French; `mai` is May in German, French and Portuguese; `set` is
 * September in Portuguese and Italian. That is why one flat map is safe.
 */
const MONTHS: Record<string, number> = {
  // English
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,

  // German. `Mär` and `März` normalise to `mar` and `marz`; the `ae` spellings
  // are for statements and exports that transliterate.
  januar: 1, jaen: 1, janner: 1, februar: 2, marz: 3, maer: 3, maerz: 3, mrz: 3,
  mai: 5, juni: 6, juli: 7, august: 8, okt: 10, oktober: 10, dez: 12, dezember: 12,

  // French
  janv: 1, janvier: 1, fevr: 2, fevrier: 2, mars: 3, avr: 4, avril: 4, juin: 6,
  juil: 7, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,

  // Spanish
  ene: 1, enero: 1, febrero: 2, marzo: 3, abr: 4, abril: 4, mayo: 5, junio: 6,
  julio: 7, ago: 8, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, dic: 12, diciembre: 12,

  // Portuguese
  janeiro: 1, fev: 2, fevereiro: 2, marco: 3, maio: 5, junho: 6, julho: 7,
  set: 9, setembro: 9, out: 10, outubro: 10, dezembro: 12,

  // Italian
  gen: 1, gennaio: 1, febbraio: 2, aprile: 4, mag: 5, maggio: 5, giu: 6, giugno: 6,
  lug: 7, luglio: 7, settembre: 9, ott: 10, ottobre: 10, dicembre: 12,

  // Dutch
  januari: 1, februari: 2, mrt: 3, maart: 3, mei: 5, juni: 6, juli: 7, augustus: 8,
};

function monthNumber(raw: string): number | undefined {
  const key = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\.$/, '');
  return MONTHS[key];
}

const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const NUMERIC_RE = /^(\d{1,2})([/\-.])(\d{1,2})(?:\2(\d{2,4}))?$/;
// `\p{L}` rather than `[A-Za-z]` so `Mär`, `août` and `déc` match.
const DAY_MONTH_RE = /^(\d{1,2})[\s\-.]{1,2}(\p{L}{3,9})\.?[\s\-.,]*(\d{2,4})?$/u;
const MONTH_DAY_RE = /^(\p{L}{3,9})\.?[\s\-.]{1,2}(\d{1,2}),?[\s]*(\d{2,4})?$/u;

function normalizeYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (raw.length <= 2) return n < 70 ? 2000 + n : 1900 + n;
  return n;
}

function isValidYmd(year: number | null, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year !== null && (year < 1900 || year > 2200)) return false;
  if (year !== null) {
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return false;
  }
  return true;
}

function buildIso(year: number | null, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return year === null ? `--${mm}-${dd}` : `${year}-${mm}-${dd}`;
}

/**
 * Cheap pre-filter used by the column classifier.
 *
 * Range-checked on purpose: a bare `\d{1,2}.\d{1,2}` pattern also matches
 * money such as `70.93`, and misclassifying an amount as a date silently
 * destroys a row.
 */
export function isDateLike(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > 24) return false;
  if (ISO_RE.test(s) || DAY_MONTH_RE.test(s) || MONTH_DAY_RE.test(s)) return true;
  const numeric = s.match(NUMERIC_RE);
  if (!numeric) return false;
  const a = Number.parseInt(numeric[1], 10);
  const b = Number.parseInt(numeric[3], 10);
  return a >= 1 && a <= 31 && b >= 1 && b <= 31;
}

/**
 * Parse a cell that is expected to be *only* a date.
 * Returns null for anything else — including "Statement period 01/01/2025",
 * which is the single most common source of phantom transactions.
 */
export function parseDate(raw: string, order: DateOrder = 'MDY', fallbackYear: number | null = null): ParsedDate | null {
  // Some banks terminate a date with a separator and stack the year on the line
  // below (Postbank prints `23.05.` with `2023` underneath). Dropping one
  // trailing separator is what lets that date be recognised at all.
  const s = raw.trim().replace(/([./-])$/, '').replace(/\s+/g, ' ');
  if (!s || s.length > 24) return null;

  const iso = s.match(ISO_RE);
  if (iso) {
    const year = normalizeYear(iso[1]);
    const month = Number.parseInt(iso[2], 10);
    const day = Number.parseInt(iso[3], 10);
    if (year === null || !isValidYmd(year, month, day)) return null;
    return { year, month, day, order: 'YMD', iso: buildIso(year, month, day) };
  }

  const numeric = s.match(NUMERIC_RE);
  if (numeric) {
    const a = Number.parseInt(numeric[1], 10);
    const b = Number.parseInt(numeric[3], 10);
    const year = normalizeYear(numeric[4]) ?? fallbackYear;

    const candidates: Array<{ month: number; day: number; order: DateOrder }> = [];
    if (order === 'DMY') {
      candidates.push({ day: a, month: b, order: 'DMY' });
    } else {
      candidates.push({ month: a, day: b, order: 'MDY' });
    }
    // If the stated order is impossible but the other reading works (e.g. a
    // single 13/04 row in a US-ordered document), take the valid reading.
    if (order === 'MDY' && a > 12 && b <= 12) candidates.unshift({ day: a, month: b, order: 'DMY' });
    if (order === 'DMY' && b > 12 && a <= 12) candidates.unshift({ month: b, day: a, order: 'MDY' });

    for (const candidate of candidates) {
      if (isValidYmd(year, candidate.month, candidate.day)) {
        return {
          year,
          month: candidate.month,
          day: candidate.day,
          order: candidate.order,
          iso: buildIso(year, candidate.month, candidate.day),
        };
      }
    }
    return null;
  }

  const dayMonth = s.match(DAY_MONTH_RE);
  if (dayMonth) {
    const month = monthNumber(dayMonth[2]);
    const day = Number.parseInt(dayMonth[1], 10);
    const year = normalizeYear(dayMonth[3]) ?? fallbackYear;
    if (month && isValidYmd(year, month, day)) {
      return { year, month, day, order: 'DMY', iso: buildIso(year, month, day) };
    }
    return null;
  }

  const monthDay = s.match(MONTH_DAY_RE);
  if (monthDay) {
    const month = monthNumber(monthDay[1]);
    const day = Number.parseInt(monthDay[2], 10);
    const year = normalizeYear(monthDay[3]) ?? fallbackYear;
    if (month && isValidYmd(year, month, day)) {
      return { year, month, day, order: 'MDY', iso: buildIso(year, month, day) };
    }
    return null;
  }

  return null;
}

/**
 * Infer MDY vs DMY from every date-ish string on the statement.
 * A value above 12 in either slot is proof; without one the document is
 * genuinely ambiguous and we say so instead of pretending to know.
 */
export function inferDateOrder(samples: string[]): DateOrderGuess {
  let mdy = 0;
  let dmy = 0;

  for (const sample of samples) {
    const s = sample.trim();
    if (ISO_RE.test(s)) continue;
    const match = s.match(NUMERIC_RE);
    if (!match) continue;
    const a = Number.parseInt(match[1], 10);
    const b = Number.parseInt(match[3], 10);
    if (a > 12 && b <= 12) dmy += 1;
    else if (b > 12 && a <= 12) mdy += 1;
  }

  if (dmy > mdy) return { order: 'DMY', ambiguous: false, evidence: { mdy, dmy } };
  if (mdy > dmy) return { order: 'MDY', ambiguous: false, evidence: { mdy, dmy } };
  return { order: 'MDY', ambiguous: true, evidence: { mdy, dmy } };
}

/** Look for "Statement period 01/01/2025 - 31/01/2025" style headers to seed the year. */
export function guessStatementYear(pages: Array<{ items: Array<{ str: string }> }>, order: DateOrder): number | null {
  const years: number[] = [];
  const text = pages
    .slice(0, 2)
    .flatMap((page) => page.items.map((item) => item.str))
    .join(' ');

  for (const match of text.matchAll(/\b(20\d{2})\b/g)) years.push(Number.parseInt(match[1], 10));
  if (years.length) return Math.max(...years);

  const parsed = text
    .split(/\s+/)
    .map((token) => parseDate(token, order))
    .find((value): value is ParsedDate => Boolean(value?.year));
  return parsed?.year ?? null;
}
