// Keyword -> canonical URL map.
//
// RULE: exactly one canonical page per search-intent cluster. Variants either
// get genuinely different content, or they 301 into the primary. Never ship two
// URLs with the same content for the same intent — that is how tool sites get
// classified as thin/duplicate and stall in the index.

export interface KeywordCluster {
  /** The cluster id, also the primary slug. */
  id: string;
  /** Canonical path that owns this cluster. */
  path: string;
  /** Phrases this page is allowed to target (used for titles/H1/copy). */
  terms: string[];
  /** Priority for the build order. */
  intent: 'tool' | 'format' | 'preset' | 'info' | 'longtail' | 'adjacent';
  /** What the searcher actually wants, so we do not build the wrong page. */
  searcherWants: string;
  /** True when another cluster could be confused with this one. */
  cannibalizationRisk?: string;
}

export const CLUSTERS: KeywordCluster[] = [
  {
    id: 'home',
    path: '/',
    terms: ['bank statement to excel', 'convert bank statement to excel', 'bank statement converter', 'bank statement to excel online free'],
    intent: 'tool',
    searcherWants: 'Paste/upload a statement PDF, get a spreadsheet back. Wants the tool immediately, above the fold.',
    cannibalizationRisk: 'Overlaps /pdf-bank-statement-to-excel if that page repeats the same copy. Keep this page tool-first; the other page explains the "why".',
  },
  {
    id: 'bank-statement-to-csv',
    path: '/bank-statement-to-csv',
    terms: ['bank statement to csv', 'convert bank statement to csv', 'csv bank statement converter'],
    intent: 'format',
    searcherWants: 'CSV specifically — usually for an importer (QuickBooks, Xero, Excel import wizard, a script).',
    cannibalizationRisk: 'Would duplicate the homepage. Differentiate with CSV-only concerns: delimiter, encoding, quoting, locale decimal separators.',
  },
  {
    id: 'pdf-bank-statement-to-excel',
    path: '/pdf-bank-statement-to-excel',
    terms: ['pdf bank statement to excel', 'bank statement pdf to excel', 'convert pdf bank statement to excel'],
    intent: 'format',
    searcherWants: 'Same tool, but the query names PDF explicitly. Often burned by generic PDF converters that mangle tables.',
    cannibalizationRisk: 'High overlap with / and /pdf-to-excel. Angle: why generic PDF→Excel fails on statements (rows, columns, running balance).',
  },
  {
    id: 'extract-transactions',
    path: '/extract-transactions',
    terms: ['extract transactions from bank statement pdf', 'bank statement transaction extractor', 'extract data from bank statement pdf'],
    intent: 'info',
    searcherWants: 'Data extraction, often at volume, and often for bookkeeping/automation. Cares about accuracy and column structure.',
    cannibalizationRisk: 'Angle: the extraction pipeline and the running-balance check, not "upload a file".',
  },
  {
    id: 'quickbooks-csv',
    path: '/quickbooks-csv',
    terms: ['bank statement to quickbooks csv', 'import bank statement into quickbooks', 'quickbooks online csv import format'],
    intent: 'preset',
    searcherWants: 'A CSV QuickBooks Online will actually accept. Header/format correctness is the whole job.',
    cannibalizationRisk: 'Must contain the real QBO import rules; if it is generic CSV copy it competes with /bank-statement-to-csv.',
  },
  {
    id: 'xero-csv',
    path: '/xero-csv',
    terms: ['bank statement to xero csv', 'import bank statement into xero', 'xero csv import format'],
    intent: 'preset',
    searcherWants: 'A CSV Xero accepts, including the *Date / *Amount required headers and the date-order Xero expects.',
    cannibalizationRisk: 'Same as QuickBooks — needs Xero-specific rules (required columns, date format).',
  },
  {
    id: 'scanned',
    path: '/scanned',
    terms: ['scanned bank statement to excel', 'bank statement ocr to excel', 'image bank statement to excel'],
    intent: 'longtail',
    searcherWants: 'To convert a scan/photo. We cannot do that in-browser for free, so the page must say so honestly and route them.',
    cannibalizationRisk: 'None. This is the honesty + affiliate page.',
  },
  {
    id: 'ofx-qfx',
    path: '/ofx-qfx-to-csv',
    terms: ['ofx to csv', 'qfx to csv', 'ofx to excel converter'],
    intent: 'adjacent',
    searcherWants: 'Convert a downloaded OFX/QFX file (not a PDF) into a spreadsheet. No OCR, no heuristics — the file is already structured.',
    cannibalizationRisk: 'Different file type entirely; keep it separate from the PDF pages.',
  },
];

/** Long-tail: {bank} bank statement to excel. One page each, template-driven. */
export interface BankPage {
  slug: string;
  name: string;
  /** Real, testable layout notes only. Never invent layout claims. */
  layoutNotes: string[];
  /** Statements from this bank we have actually verified against, or empty. */
  verified: number;
}

export const BANKS: BankPage[] = [
  {
    slug: 'chase',
    name: 'Chase',
    layoutNotes: [
      'Date column is left-aligned and uses MM/DD/YYYY.',
      'Separate "Details" and "Amount" columns with a running "Balance" column on the right.',
      'Debits print without a minus sign; credit/debit direction comes from the sign in the Amount column.',
    ],
    verified: 0,
  },
  {
    slug: 'bank-of-america',
    name: 'Bank of America',
    layoutNotes: [
      'Columns are Date, Description, Amount, Running Bal.',
      'Debits print with a leading minus sign, deposits without one.',
      'Multi-line merchant descriptions are common — the continuation line carries no date.',
    ],
    verified: 0,
  },
  {
    slug: 'wells-fargo',
    name: 'Wells Fargo',
    layoutNotes: [
      'A "Daily Balance" summary block is printed on later pages and looks like transactions — it has to be excluded.',
      'Separate withdrawals and deposits column pairs appear on some statement cycles.',
    ],
    verified: 0,
  },
  {
    slug: 'hdfc',
    name: 'HDFC Bank',
    layoutNotes: [
      'Indian statement layout: Date, Narration, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance.',
      'Amounts use Indian grouping (1,23,456.78) — the parser has to tolerate 2-digit groups.',
      'Dates are DD/MM/YY.',
    ],
    verified: 0,
  },
  {
    slug: 'icici',
    name: 'ICICI Bank',
    layoutNotes: [
      'Slightly different column set from HDFC; "Transaction Remarks" is the description.',
      'Long remarks are truncated with a trailing "..." in the PDF text layer.',
    ],
    verified: 0,
  },
  {
    slug: 'hsbc',
    name: 'HSBC',
    layoutNotes: [
      'Statement can print in either DD/MM or MM/DD depending on the account country — always confirm the date order.',
      'Balance column is labelled "Balance" and is always last.',
    ],
    verified: 0,
  },
  {
    slug: 'barclays',
    name: 'Barclays',
    layoutNotes: [
      'UK statements use DD/MM/YYYY.',
      'Separate "Paid out" and "Paid in" columns plus a "Balance" column.',
    ],
    verified: 0,
  },
];
