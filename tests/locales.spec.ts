import { describe, expect, it } from 'vitest';
import { convertDocument } from '../src/lib/parse';
import { buildExport, rowsForPreset } from '../src/lib/exporters';
import { EXPORT_LOCALES, LOCALES, defaultExportLocaleFor, exportLocalesFor, getExportLocale } from '../src/i18n/locales';
import { formatAmountDisplay, formatAmountLocale, formatAmountPlain, localeSample } from '../src/i18n/format';
import { openFixture } from './helpers/pdfjs';

/**
 * The localisation tests that matter.
 *
 * Translating an interface is the easy half. The half that decides whether a
 * German or Brazilian user can actually use the output is the number and date
 * format: `-1234.56` in a comma-delimited file is one unparseable cell to them.
 * These tests assert the file their Excel can read.
 */

async function germanStatement() {
  return convertDocument(await openFixture('euro-decimal'));
}

describe('export locale definitions', () => {
  it('gives every UI language a default export locale that exists', () => {
    for (const code of Object.keys(LOCALES) as Array<keyof typeof LOCALES>) {
      const exportCode = defaultExportLocaleFor(code);
      expect(EXPORT_LOCALES[exportCode], `${code} -> ${exportCode}`).toBeDefined();
      expect(EXPORT_LOCALES[exportCode].language).toBe(code);
    }
  });

  it('gives comma-decimal locales a semicolon delimiter, and never the reverse', () => {
    for (const locale of Object.values(EXPORT_LOCALES)) {
      if (locale.decimal === ',') {
        expect(locale.csvDelimiter, `${locale.code} has a decimal comma`).toBe(';');
      }
      // A dot-decimal locale may still use a semicolon (de-CH does not, but the
      // inverse rule is the one that must hold).
      if (locale.csvDelimiter === ',') {
        expect(locale.decimal, `${locale.code} uses a comma delimiter`).toBe('.');
      }
    }
  });

  it('marks Indian locales as lakh grouping and others as western', () => {
    expect(EXPORT_LOCALES['en-IN'].grouping).toBe('indian');
    expect(EXPORT_LOCALES['hi-IN'].grouping).toBe('indian');
    expect(EXPORT_LOCALES['en-US'].grouping).toBe('western');
    expect(EXPORT_LOCALES['de-DE'].grouping).toBe('western');
  });

  it('falls back to a sane default rather than throwing on an unknown code', () => {
    expect(getExportLocale('xx-XX').code).toBe('en-US');
    expect(getExportLocale(undefined).code).toBe('en-US');
  });

  it('groups export locales by UI language', () => {
    expect(exportLocalesFor('de').map((entry) => entry.code)).toEqual(['de-DE', 'de-AT', 'de-CH']);
    expect(exportLocalesFor('en').length).toBeGreaterThanOrEqual(5);
  });
});

describe('locale number formatting', () => {
  it('uses a comma decimal and a dot thousands separator in German display', () => {
    expect(formatAmountDisplay(-1234.56, EXPORT_LOCALES['de-DE'])).toBe('-1.234,56');
    expect(localeSample(EXPORT_LOCALES['de-DE'])).toBe('1.234.567,89');
  });

  it('groups Indian amounts in lakhs and crores', () => {
    expect(localeSample(EXPORT_LOCALES['en-IN'])).toBe('12,34,567.89');
    expect(localeSample(EXPORT_LOCALES['hi-IN'])).toBe('12,34,567.89');
    expect(formatAmountDisplay(12345.67, EXPORT_LOCALES['en-IN'])).toBe('12,345.67');
    expect(formatAmountDisplay(123456.78, EXPORT_LOCALES['en-IN'])).toBe('1,23,456.78');
  });

  it('never writes a thousands separator into exported data', () => {
    // A French grouping separator is a space, which would split the CSV field.
    expect(formatAmountPlain(-1234.56, EXPORT_LOCALES['fr-FR'])).toBe('-1234,56');
    expect(formatAmountPlain(-1234.56, EXPORT_LOCALES['de-DE'])).toBe('-1234,56');
    expect(formatAmountPlain(1234567.89, EXPORT_LOCALES['en-IN'])).toBe('1234567.89');
    expect(formatAmountPlain(1234.56, EXPORT_LOCALES['en-US'])).toBe('1234.56');
  });

  it('keeps Swiss digits dot-decimal with an apostrophe only on screen', () => {
    expect(formatAmountDisplay(1234.56, EXPORT_LOCALES['de-CH'])).toBe('1’234.56');
    expect(formatAmountPlain(1234.56, EXPORT_LOCALES['de-CH'])).toBe('1234.56');
  });

  it('blanks a zero debit cell rather than printing 0,00', () => {
    expect(formatAmountDisplay(0, EXPORT_LOCALES['de-DE'])).toBe('');
    expect(formatAmountLocale(0, EXPORT_LOCALES['de-DE'], { group: true })).toBe('0,00');
  });
});

describe('localised CSV export', () => {
  it('produces a German CSV that German Excel opens in columns', async () => {
    const result = await germanStatement();
    const artifact = await buildExport(result, { preset: 'csv', exportLocale: 'de-DE', sourceName: 'konto.pdf' });
    const text = (artifact.text ?? '').replace(/^\uFEFF/, '');
    const lines = text.split('\r\n');

    expect(lines[0]).toBe('Date;Description;Debit;Credit;Amount;Balance');
    // Semicolon-delimited: no bare comma may act as a field separator.
    const first = lines[1].split(';');
    expect(first).toHaveLength(6);
    // Dates in the German order, amounts with a comma decimal.
    expect(first[0]).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    expect(first[4]).toMatch(/^-?\d+,\d{2}$/);
  });

  it('yields numbers, not strings, once the German CSV is parsed the German way', async () => {
    const result = await germanStatement();
    const artifact = await buildExport(result, { preset: 'csv', exportLocale: 'de-DE' });
    const text = (artifact.text ?? '').replace(/^\uFEFF/, '');
    const [header, ...rows] = text.split('\r\n').filter(Boolean);

    const columns = header.split(';');
    const amountIndex = columns.indexOf('Amount');

    for (const row of rows.slice(0, 10)) {
      // This is exactly what a German spreadsheet does: split on ';', then read
      // ',' as the decimal point.
      const raw = row.split(';')[amountIndex];
      const parsed = Number(raw.replace(',', '.'));
      expect(Number.isNaN(parsed), `could not parse ${raw}`).toBe(false);
      expect(raw).not.toContain('.');
    }
  });

  it('keeps US output exactly as it was', async () => {
    const result = await germanStatement();
    const artifact = await buildExport(result, { preset: 'csv', exportLocale: 'en-US' });
    expect((artifact.text ?? '').split('\r\n')[0]).toBe('\uFEFFDate,Description,Debit,Credit,Amount,Balance');
  });

  it('switches Mexiko to comma-delimited dot-decimals', async () => {
    const result = await germanStatement();
    const rows = rowsForPreset(result, { preset: 'csv', exportLocale: 'es-MX' });
    expect(rows[1][4]).toMatch(/^-?\d+\.\d{2}$/);
    expect(rows[1][0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('lets an explicit delimiter override the locale default', async () => {
    const result = await germanStatement();
    const artifact = await buildExport(result, { preset: 'csv', exportLocale: 'de-DE', delimiter: ',' });
    // Comma-delimited with comma decimals must still round-trip, because every
    // field containing a comma is quoted.
    expect((artifact.text ?? '').split('\r\n')[1]).toMatch(/"/);
  });

  it('honours a date-format override on top of the locale', async () => {
    const result = await germanStatement();
    const rows = rowsForPreset(result, { preset: 'csv', exportLocale: 'de-DE', dateFormat: 'YYYY-MM-DD' });
    expect(rows[1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('localised importer presets', () => {
  it('signs and formats a German QuickBooks row the way German QuickBooks expects', async () => {
    const result = await germanStatement();
    const rows = rowsForPreset(result, { preset: 'quickbooks', exportLocale: 'de-DE' });
    expect(rows[0]).toEqual(['Date', 'Description', 'Amount']);
    expect(rows[1][2]).toMatch(/^-?\d+,\d{2}$/);
    expect(rows[1][0]).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('writes XLSX with a locale-appropriate date display format but real date values', async () => {
    const readXlsxFile = (await import('read-excel-file/node')).default;
    const result = await germanStatement();
    const artifact = await buildExport(result, { preset: 'xlsx', exportLocale: 'de-DE' });
    const rows = await readXlsxFile(Buffer.from(artifact.bytes as Uint8Array), { sheet: 'Transactions' });
    // A real Date object, so Excel renders it in whatever locale the reader has.
    expect(rows[1][0]).toBeInstanceOf(Date);
    expect(typeof rows[1][4]).toBe('number');
  });
});
