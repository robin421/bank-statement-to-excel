/**
 * Date formatting for exports.
 *
 * Importers are fussy about this in ways that are invisible until the import
 * fails: QuickBooks wants a locale-matching format, Xero rejects a mismatched
 * one outright, and spreadsheets silently reinterpret `03/04/2025` depending on
 * the reading machine's locale. So the format is an explicit user choice, never
 * a guess.
 */

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD.MM.YYYY' | 'DD-MMM-YYYY';

export const DATE_FORMATS: Array<{ value: DateFormat; label: string; hint?: string }> = [
  { value: 'YYYY-MM-DD', label: '2025-01-31 (ISO)', hint: 'Sorts correctly everywhere' },
  { value: 'DD/MM/YYYY', label: '31/01/2025', hint: 'UK, EU, India, Australia' },
  { value: 'MM/DD/YYYY', label: '01/31/2025', hint: 'US' },
  { value: 'DD.MM.YYYY', label: '31.01.2025', hint: 'Germany, Austria, Switzerland' },
  { value: 'DD-MMM-YYYY', label: '31-Jan-2025', hint: 'Unambiguous in every locale' },
];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso: string): { year: number; month: number; day: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Format an ISO date (or partial `--MM-DD`) for a chosen export locale. */
export function formatDate(iso: string | null, format: DateFormat, fallbackYear = 2000): string {
  if (!iso) return '';
  const partial = iso.match(/^--(\d{2})-(\d{2})$/);
  const resolved = partial ? `${fallbackYear}-${partial[1]}-${partial[2]}` : iso;
  const value = parts(resolved);
  if (!value) return iso;

  const dd = String(value.day).padStart(2, '0');
  const mm = String(value.month).padStart(2, '0');

  switch (format) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${value.year}`;
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${value.year}`;
    case 'DD.MM.YYYY':
      return `${dd}.${mm}.${value.year}`;
    case 'DD-MMM-YYYY':
      return `${dd}-${MONTH_ABBR[value.month - 1] ?? mm}-${value.year}`;
    case 'YYYY-MM-DD':
    default:
      return `${value.year}-${mm}-${dd}`;
  }
}

/** Real Date object for spreadsheet cells (Excel stores dates as serials). */
export function toDateObject(iso: string | null, fallbackYear = 2000): Date | null {
  if (!iso) return null;
  const partial = iso.match(/^--(\d{2})-(\d{2})$/);
  const resolved = partial ? `${fallbackYear}-${partial[1]}-${partial[2]}` : iso;
  const value = parts(resolved);
  if (!value) return null;
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}
