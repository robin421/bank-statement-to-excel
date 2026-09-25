import { extractPages } from '../pdf/extractPages';
import type { ExtractTextOptions, PdfJsLikeDocument, PdfPageText } from '../pdf/types';
import { buildRows } from './rows';
import { classifyCell, detectColumns, type ColumnModel } from './columns';
import { inferDateOrder, guessStatementYear, parseDate, type DateOrder } from './date';
import { rankRoleHypotheses, type Transaction } from './transactions';
import { flagMismatches, type ReconcileReport } from './reconcile';
import { assessQuality, type QualityReport } from './quality';

export interface ConvertOptions extends ExtractTextOptions {
  /** 'auto' infers MDY vs DMY from the document and reports the ambiguity. */
  dateOrder?: DateOrder | 'auto';
  /** Force a statement year for statements that print only day/month. */
  statementYear?: number | null;
}

export interface ColumnSummary {
  key: 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance';
  present: boolean;
}

export interface StatementResult {
  transactions: Transaction[];
  columns: ColumnSummary[];
  dateOrder: DateOrder;
  dateOrderAmbiguous: boolean;
  dateOrderEvidence: { mdy: number; dmy: number };
  reconciliation: ReconcileReport;
  quality: QualityReport;
  warnings: string[];
  meta: {
    pages: number;
    hypothesis: string;
    hypothesisScore: number;
    alternatives: Array<{ label: string; score: number; passRate: number; checked: number }>;
    detectedBands: number;
    headerRow: number | null;
    /** 'pdf' (layout heuristics) or 'ofx' (structured data). */
    source?: 'pdf' | 'ofx';
    account?: string;
    currency?: string;
  };
}

export function convertPages(pages: PdfPageText[], options: ConvertOptions = {}): StatementResult {
  const rows = buildRows(pages);
  const model = detectColumns(rows);

  const dateSamples = rows
    .flatMap((row) => row.cells)
    .filter((cell) => classifyCell(cell) === 'date')
    .map((cell) => cell.str.trim());

  const guess = inferDateOrder(dateSamples);
  const dateOrder: DateOrder = options.dateOrder && options.dateOrder !== 'auto' ? options.dateOrder : guess.order;
  const dateOrderAmbiguous = options.dateOrder && options.dateOrder !== 'auto' ? false : guess.ambiguous;

  const fallbackYear = options.statementYear ?? guessStatementYear(pages, dateOrder);

  const ranked = rankRoleHypotheses(rows, model, { dateOrder, fallbackYear });
  const best = ranked[0];

  const transactions = best ? best.transactions : [];
  const reconciliation = best ? best.reconciliation : { checked: 0, matched: 0, passRate: 0, mismatches: [], signCorrections: 0 };

  // The preview and the Notes column both promise that rows which break the
  // running-balance chain are marked, so carry each mismatch onto its row.
  flagMismatches(transactions, reconciliation);

  const warnings: string[] = [];
  if (dateOrderAmbiguous) {
    warnings.push(
      'The statement does not make the day/month order obvious (no date above the 12th). It has been read as ' +
        (dateOrder === 'DMY' ? 'day/month' : 'month/day') +
        ' — change it if the dates look wrong.',
    );
  }
  if (dateOrder !== guess.order && guess.order !== (options.dateOrder as DateOrder)) {
    warnings.push(`Dates were read as ${dateOrder} although the document suggested ${guess.order}.`);
  }
  if (reconciliation.checked === 0 && transactions.length > 1) {
    warnings.push('No usable running-balance column was found, so the rows could not be checked against the statement.');
  } else if (reconciliation.mismatches.length) {
    warnings.push(
      `${reconciliation.mismatches.length} row(s) do not reconcile against the running balance. They are flagged in the preview.`,
    );
  }
  if (model.moneyBands.length > 3) {
    warnings.push(`Detected ${model.moneyBands.length} numeric columns; extra columns were ignored.`);
  }

  const hasBalance = transactions.some((transaction) => transaction.balance !== null);
  const hasDebit = transactions.some((transaction) => transaction.debit !== null && transaction.debit !== 0);
  const hasCredit = transactions.some((transaction) => transaction.credit !== null && transaction.credit !== 0);

  const columns: ColumnSummary[] = [
    { key: 'date', present: transactions.some((transaction) => Boolean(transaction.date)) },
    { key: 'description', present: transactions.some((transaction) => Boolean(transaction.description)) },
    { key: 'debit', present: hasDebit },
    { key: 'credit', present: hasCredit },
    { key: 'amount', present: !hasDebit && !hasCredit },
    { key: 'balance', present: hasBalance },
  ];

  return {
    transactions,
    columns,
    dateOrder,
    dateOrderAmbiguous,
    dateOrderEvidence: guess.evidence,
    reconciliation,
    quality: assessQuality(pages, transactions, reconciliation),
    warnings,
    meta: {
      pages: pages.length,
      hypothesis: best?.label ?? 'none',
      hypothesisScore: best?.score ?? 0,
      alternatives: ranked.slice(0, 4).map((entry) => ({
        label: entry.label,
        score: Math.round(entry.score * 1000) / 1000,
        passRate: Math.round(entry.reconciliation.passRate * 100) / 100,
        checked: entry.reconciliation.checked,
      })),
      detectedBands: model.bands.length,
      headerRow: model.headerRowIndex,
      source: 'pdf',
    },
  };
}

/** Full pipeline: pdf.js document in, statement rows out. */
export async function convertDocument(doc: PdfJsLikeDocument, options: ConvertOptions = {}): Promise<StatementResult> {
  const pages = await extractPages(doc, options);
  return convertPages(pages, options);
}

export { extractPages, buildRows, detectColumns, classifyCell };
export type { ColumnModel };
