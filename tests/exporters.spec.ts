import { describe, expect, it } from 'vitest';
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import { convertDocument } from '../src/lib/parse';
import { buildExport, rowsForPreset } from '../src/lib/exporters';
import { toCsv, escapeCsvField } from '../src/lib/exporters/csv';
import { formatDate } from '../src/lib/exporters/dates';
import { openFixture } from './helpers/pdfjs';

async function parseFixture(name: string) {
  return convertDocument(await openFixture(name));
}

describe('csv writer', () => {
  it('quotes only when needed and doubles embedded quotes', () => {
    expect(escapeCsvField('plain', ',')).toBe('plain');
    expect(escapeCsvField('has,comma', ',')).toBe('"has,comma"');
    expect(escapeCsvField('has "quotes"', ',')).toBe('"has ""quotes"""');
    expect(escapeCsvField('has\nnewline', ',')).toBe('"has\nnewline"');
    expect(escapeCsvField('', ',')).toBe('');
  });

  it('keeps semicolons unquoted when the delimiter is a comma', () => {
    expect(escapeCsvField('a;b', ',')).toBe('a;b');
    expect(escapeCsvField('a;b', ';')).toBe('"a;b"');
  });

  it('writes CRLF line endings and an optional BOM', () => {
    const csv = toCsv([['a', 'b'], ['1', '2']], { bom: true });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFa,b\r\n1,2\r\n');
  });
});

describe('date formatting', () => {
  it('formats every supported locale shape', () => {
    expect(formatDate('2025-01-31', 'YYYY-MM-DD')).toBe('2025-01-31');
    expect(formatDate('2025-01-31', 'DD/MM/YYYY')).toBe('31/01/2025');
    expect(formatDate('2025-01-31', 'MM/DD/YYYY')).toBe('01/31/2025');
    expect(formatDate('2025-01-31', 'DD.MM.YYYY')).toBe('31.01.2025');
    expect(formatDate('2025-01-31', 'DD-MMM-YYYY')).toBe('31-Jan-2025');
  });

  it('resolves a partial date using the statement year', () => {
    expect(formatDate('--03-14', 'YYYY-MM-DD', 2024)).toBe('2024-03-14');
  });

  it('returns an empty string for a missing date rather than inventing one', () => {
    expect(formatDate(null, 'YYYY-MM-DD')).toBe('');
  });
});

describe('export presets', () => {
  it('emits the exact QuickBooks Online header', async () => {
    const result = await parseFixture('chase-like');
    const artifact = await buildExport(result, { preset: 'quickbooks', sourceName: 'chase.pdf' });
    expect(artifact.text?.split('\r\n')[0]).toBe('\uFEFFDate,Description,Amount');
    expect(artifact.fileName).toBe('chase-transactions.csv');
  });

  it('emits the required Xero headers', async () => {
    const result = await parseFixture('hsbc-like');
    const artifact = await buildExport(result, { preset: 'xero', sourceName: 'hsbc.pdf' });
    expect(artifact.text?.split('\r\n')[0]).toBe('\uFEFF*Date,*Amount,Payee,Description,Reference');
  });

  it('signs outflows negative for importers', async () => {
    const result = await parseFixture('hdfc-like');
    const rows = rowsForPreset(result, { preset: 'quickbooks' });
    const amounts = rows.slice(1).map((row) => Number(row[2]));
    expect(amounts.some((value) => value < 0)).toBe(true);
    expect(amounts.some((value) => value > 0)).toBe(true);
    // HDFC prints withdrawals as positive numbers in their own column; the
    // importer needs them negative.
    const expected = result.transactions.map((transaction) => Math.round(transaction.amount * 100) / 100);
    expect(amounts).toEqual(expected);
  });

  it('keeps debit and credit as separate positive columns for the generic CSV', async () => {
    const result = await parseFixture('hdfc-like');
    const rows = rowsForPreset(result, { preset: 'csv' });
    expect(rows[0]).toEqual(['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance']);
    for (const row of rows.slice(1)) {
      if (row[2]) expect(Number(row[2])).toBeGreaterThan(0);
      if (row[3]) expect(Number(row[3])).toBeGreaterThan(0);
    }
  });

  it('honours an explicit date format override', async () => {
    const result = await parseFixture('chase-like');
    const rows = rowsForPreset(result, { preset: 'quickbooks', dateFormat: 'DD-MMM-YYYY' });
    expect(rows[1][0]).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4}$/);
  });

  it('produces an xlsx that reads back with typed dates and numbers', async () => {
    const result = await parseFixture('chase-like');
    const artifact = await buildExport(result, { preset: 'xlsx', sourceName: 'chase.pdf' });
    expect(artifact.bytes).toBeInstanceOf(Uint8Array);

    const buffer = Buffer.from(artifact.bytes as Uint8Array);
    expect(await readSheetNames(buffer)).toEqual(['Transactions', 'Summary', 'Raw']);

    const rows = await readXlsxFile(buffer, { sheet: 'Transactions' });
    expect(rows).toHaveLength(result.transactions.length + 1);
    expect(rows[0]).toEqual(['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance', 'Notes']);
    expect(rows[1][0]).toBeInstanceOf(Date);
    expect(typeof rows[1][4]).toBe('number');
    expect(rows[1][1]).toBe(result.transactions[0].description);

    const summary = await readXlsxFile(buffer, { sheet: 'Summary' });
    const balanceRow = summary.find((row) => row[0] === 'Balance check');
    expect(String(balanceRow?.[1])).toMatch(/of \d+ rows/);
  });

  it('records the source line for every row in the Raw sheet', async () => {
    const result = await parseFixture('icici-like');
    const artifact = await buildExport(result, { preset: 'xlsx' });
    const raw = await readXlsxFile(Buffer.from(artifact.bytes as Uint8Array), { sheet: 'Raw' });
    // Header row plus one row per transaction.
    expect(raw).toHaveLength(result.transactions.length + 1);
    expect(raw[1][0]).toBe(1);
    expect(String(raw[1][5]).length).toBeGreaterThan(0);
  });

  it('writes a zero balance delta on rows that reconcile', async () => {
    const result = await parseFixture('chase-like');
    const artifact = await buildExport(result, { preset: 'xlsx' });
    const raw = await readXlsxFile(Buffer.from(artifact.bytes as Uint8Array), { sheet: 'Raw' });
    const deltas = raw.slice(2).map((row) => String(row[3]));
    expect(deltas.every((delta) => delta === '' || delta === '0.00')).toBe(true);
  });
});
