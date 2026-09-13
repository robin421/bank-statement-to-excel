import writeXlsxFile, { type Sheet } from 'write-excel-file/universal';
import type { StatementResult } from '../parse';
import type { Transaction } from '../parse/transactions';
import { toDateObject, type DateFormat } from './dates';

const MONEY_FORMAT_CODE = '#,##0.00';

/**
 * Excel format code for each supported date style.
 * The cell value is a real date, so this only controls how Excel draws it —
 * which means a wrong guess is cosmetic, never a misread date.
 */
const EXCEL_DATE_FORMAT: Record<DateFormat, string> = {
  'YYYY-MM-DD': 'yyyy-mm-dd',
  'DD/MM/YYYY': 'dd/mm/yyyy',
  'MM/DD/YYYY': 'mm/dd/yyyy',
  'DD.MM.YYYY': 'dd.mm.yyyy',
  'DD-MMM-YYYY': 'dd-mmm-yyyy',
};

function headerCell(text: string) {
  return { value: text, fontWeight: 'bold' as const, backgroundColor: '#F4F2EC', bottomBorderStyle: 'thin' as const };
}

function dateCell(value: Date | null, formatCode: string) {
  return value ? { value, type: Date, format: formatCode } : null;
}

function moneyCell(value: number | null) {
  return value === null || value === undefined ? null : { value, type: Number, format: MONEY_FORMAT_CODE };
}

function textCell(value: string) {
  return { value, wrap: false };
}

const TRANSACTION_HEADERS = ['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance', 'Notes'];

/**
 * Build a three-sheet workbook.
 *
 *  - Transactions: the data, typed (real dates, real numbers) so Excel can sort,
 *    sum and pivot without a conversion step.
 *  - Summary: what the tool actually verified, so a bookkeeper can see whether to
 *    trust the sheet without re-deriving it.
 *  - Raw: the original text line per row, because the honest answer to "why is
 *    this row like that?" is the source line.
 *
 * Uses write-excel-file rather than SheetJS: it is npm-hosted, MIT, has real
 * TypeScript types, and only writes — which is all this tool needs, and avoids
 * depending on a build-time tarball URL from a third-party CDN.
 *
 * Numbers and dates are written as real numbers and real dates, so Excel applies
 * the reader's own locale for separators. That is the one output format that
 * cannot get a decimal separator wrong.
 */
export async function buildXlsx(
  result: StatementResult,
  sourceName = 'statement.pdf',
  dateFormat: DateFormat = 'YYYY-MM-DD',
): Promise<Uint8Array> {
  const dateFormatCode = EXCEL_DATE_FORMAT[dateFormat] ?? EXCEL_DATE_FORMAT['YYYY-MM-DD'];
  const transactionRows: unknown[][] = [TRANSACTION_HEADERS.map(headerCell)];

  for (const transaction of result.transactions) {
    transactionRows.push([
      dateCell(toDateObject(transaction.date), dateFormatCode),
      textCell(transaction.description),
      moneyCell(transaction.debit),
      moneyCell(transaction.credit),
      moneyCell(transaction.amount),
      moneyCell(transaction.balance),
      textCell(transaction.flags.filter((flag) => flag !== 'multiline-description').join('; ')),
    ]);
  }

  const transactionsSheet = {
    data: transactionRows,
    sheet: 'Transactions',
    stickyRowsCount: 1,
    columns: [
      { width: 12 },
      { width: 46 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 24 },
    ],
  } as Sheet<Blob>;

  const reconciliation = result.reconciliation.checked
    ? `${result.reconciliation.matched} of ${result.reconciliation.checked} rows (${Math.round(result.reconciliation.passRate * 100)}%)`
    : 'No balance column found — rows were not verified against the statement';

  const summaryRows: unknown[][] = [
    ['Field', 'Value'].map(headerCell),
    [textCell('Source file'), textCell(sourceName)],
    [textCell('Generated'), textCell(new Date().toISOString())],
    [textCell('Transactions extracted'), { value: result.transactions.length, type: Number }],
    [textCell('Pages read'), { value: result.meta.pages, type: Number }],
    [textCell('Balance check'), textCell(reconciliation)],
    [
      textCell('Date order used'),
      textCell(
        result.dateOrder === 'DMY' ? 'day/month/year' : result.dateOrder === 'MDY' ? 'month/day/year' : 'year-month-day',
      ),
    ],
    [textCell('Date order proved by the document'), textCell(result.dateOrderAmbiguous ? 'No — ambiguous, default applied' : 'Yes')],
    [textCell('Layout detected'), textCell(result.meta.hypothesis)],
    [textCell('Confidence'), textCell(result.quality.status)],
    [textCell('Notes'), textCell([...result.quality.reasons, ...result.warnings].join(' ') || 'None')],
  ];

  const summarySheet = {
    data: summaryRows,
    sheet: 'Summary',
    columns: [{ width: 34 }, { width: 78 }],
  } as Sheet<Blob>;

  const rawRows: unknown[][] = [['Row', 'Page', 'Date as printed', 'Balance delta', 'Flags', 'Source line'].map(headerCell)];
  result.transactions.forEach((transaction) => {
    rawRows.push([
      { value: transaction.index + 1, type: Number },
      { value: transaction.page, type: Number },
      textCell(transaction.dateRaw ?? ''),
      textCell(balanceDelta(result, transaction)),
      textCell(transaction.flags.join('; ')),
      textCell(transaction.rawText),
    ]);
  });

  const rawSheet = {
    data: rawRows,
    sheet: 'Raw',
    stickyRowsCount: 1,
    columns: [{ width: 6 }, { width: 6 }, { width: 16 }, { width: 14 }, { width: 26 }, { width: 90 }],
  } as Sheet<Blob>;

  // The universal entry returns a handle; `toBlob()` works in both the browser
  // and Node 18+, so the same code path is exercised by the tests.
  const file = writeXlsxFile([transactionsSheet, summarySheet, rawSheet] as Sheet<Blob>[]);
  const blob = await file.toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}

/** How far this row's arithmetic is from the statement's own balance chain. */
function balanceDelta(result: StatementResult, transaction: Transaction): string {
  const previous = transaction.index > 0 ? result.transactions[transaction.index - 1] : undefined;
  if (!previous || previous.balance === null || transaction.balance === null) return '';
  return (Math.round((previous.balance + transaction.amount - transaction.balance) * 100) / 100).toFixed(2);
}
