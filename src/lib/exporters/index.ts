import type { StatementResult } from '../parse';
import type { Transaction } from '../parse/transactions';
import { toCsv, type Delimiter } from './csv';
import { formatDate, type DateFormat } from './dates';

export type Preset = 'xlsx' | 'csv' | 'quickbooks' | 'xero';

export interface PresetDefinition {
  id: Preset;
  label: string;
  shortLabel: string;
  description: string;
  extension: string;
  mimeType: string;
  defaultDateFormat: DateFormat;
  /** Column layout shown in the UI and used in the export. */
  columns: string[];
}

/**
 * Export presets.
 *
 * These are the reason the QuickBooks and Xero pages exist: a generic CSV is
 * easy, but an importer-ready file is not. The headers below are the ones the
 * importers actually require, not a generic shape that fails on upload.
 */
export const PRESETS: Record<Preset, PresetDefinition> = {
  xlsx: {
    id: 'xlsx',
    label: 'Excel workbook (.xlsx)',
    shortLabel: 'Excel',
    description: 'Three sheets: Transactions, Summary (what was verified) and Raw (source lines).',
    extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    defaultDateFormat: 'YYYY-MM-DD',
    columns: ['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance', 'Notes'],
  },
  csv: {
    id: 'csv',
    label: 'CSV (one row per transaction)',
    shortLabel: 'CSV',
    description: 'Date, Description, Debit, Credit, Amount, Balance. Opens anywhere.',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    defaultDateFormat: 'YYYY-MM-DD',
    columns: ['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance'],
  },
  quickbooks: {
    id: 'quickbooks',
    label: 'QuickBooks Online (bank CSV)',
    shortLabel: 'QuickBooks',
    description: 'Date, Description, Amount with outflows negative - the shape QuickBooks Online expects.',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    defaultDateFormat: 'MM/DD/YYYY',
    columns: ['Date', 'Description', 'Amount'],
  },
  xero: {
    id: 'xero',
    label: 'Xero (statement import CSV)',
    shortLabel: 'Xero',
    description: '*Date, *Amount, Payee, Description, Reference with outflows negative.',
    extension: 'csv',
    mimeType: 'text/csv;charset=utf-8',
    defaultDateFormat: 'DD/MM/YYYY',
    columns: ['*Date', '*Amount', 'Payee', 'Description', 'Reference'],
  },
};

export interface ExportOptions {
  preset: Preset;
  dateFormat?: DateFormat;
  delimiter?: Delimiter;
  /** Add a UTF-8 BOM so Excel on Windows reads accented merchant names. */
  bom?: boolean;
  sourceName?: string;
  /** Used when the statement only printed day/month. */
  fallbackYear?: number;
}

export interface ExportArtifact {
  preset: Preset;
  fileName: string;
  mimeType: string;
  rowCount: number;
  /** Present for CSV presets. */
  text?: string;
  /** Present for the XLSX preset. */
  bytes?: Uint8Array;
}

function signedAmount(transaction: Transaction): number {
  // Importers expect outflows negative and inflows positive. Our `amount` is
  // already signed that way, which is why the sign correction matters upstream.
  return Math.round(transaction.amount * 100) / 100;
}

function baseNameFor(sourceName: string | undefined, preset: Preset): string {
  const stem = (sourceName ?? 'bank-statement')
    .replace(/\.(pdf|ofx|qfx|csv|txt)$/i, '')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `${stem || 'bank-statement'}-transactions`;
}

/** Tabular rows (strings) for the chosen preset — shared by CSV and the UI preview. */
export function rowsForPreset(result: StatementResult, options: ExportOptions): string[][] {
  const preset = PRESETS[options.preset];
  const dateFormat = options.dateFormat ?? preset.defaultDateFormat;
  const year = options.fallbackYear ?? 2000;
  const money = (value: number | null): string => (value === null ? '' : value.toFixed(2));

  const rows: string[][] = [preset.columns.slice()];

  for (const transaction of result.transactions) {
    const printedDate = formatDate(transaction.date, dateFormat, year);
    if (options.preset === 'quickbooks') {
      rows.push([printedDate, transaction.description, signedAmount(transaction).toFixed(2)]);
    } else if (options.preset === 'xero') {
      rows.push([printedDate, signedAmount(transaction).toFixed(2), '', transaction.description, '']);
    } else if (options.preset === 'csv') {
      rows.push([
        printedDate,
        transaction.description,
        money(transaction.debit),
        money(transaction.credit),
        transaction.amount.toFixed(2),
        money(transaction.balance),
      ]);
    } else {
      rows.push([printedDate, transaction.description, money(transaction.debit), money(transaction.credit), transaction.amount.toFixed(2), money(transaction.balance), transaction.flags.join('; ')]);
    }
  }

  return rows;
}

export async function buildExport(result: StatementResult, options: ExportOptions): Promise<ExportArtifact> {
  const preset = PRESETS[options.preset];
  const fileName = `${baseNameFor(options.sourceName, options.preset)}.${preset.extension}`;

  if (options.preset === 'xlsx') {
    // Dynamic import keeps ~400 kB of SheetJS out of the initial page load.
    const { buildXlsx } = await import('./xlsx');
    return {
      preset: options.preset,
      fileName,
      mimeType: preset.mimeType,
      rowCount: result.transactions.length,
      bytes: await buildXlsx(result, options.sourceName ?? 'statement.pdf'),
    };
  }

  const text = toCsv(rowsForPreset(result, options), {
    delimiter: options.delimiter ?? ',',
    bom: options.bom ?? true,
  });

  return {
    preset: options.preset,
    fileName,
    mimeType: preset.mimeType,
    rowCount: result.transactions.length,
    text,
  };
}

export { toCsv, formatDate };
export type { DateFormat, Delimiter };
