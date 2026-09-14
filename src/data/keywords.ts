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
