/**
 * Bank dataset.
 *
 * The rule this file enforces: **a bank page exists only for a bank we have
 * actually tested a statement from.** Same copy with the bank name swapped is a
 * doorway page — Google says so explicitly, and on a domain this new it is not
 * a risk worth taking for a handful of long-tail queries.
 *
 * So the layout notes below are stored as *hypotheses*, not claims. They are
 * what we expect the statement to do, written down so that a real statement can
 * confirm or refute them. `npm run verify:bank <file>` produces the evidence,
 * which is recorded in `verifications`, and only then does a page get generated
 * with those tested findings on it.
 *
 * This also means the notes are useful before they are publishable: they are
 * the checklist for testing.
 */

export type NoteState = 'hypothesis' | 'confirmed' | 'refuted';

export interface LayoutNote {
  /** What we expect this bank's statement to do. */
  text: string;
  state: NoteState;
  /** What we actually observed, once tested. */
  observation?: string;
}

export interface VerificationRecord {
  /** ISO date the statement was tested. */
  date: string;
  pages: number;
  /** Transactions the parser recovered. */
  rows: number;
  /** Share of consecutive rows whose balance chain agreed, 0..1. */
  reconcileRate: number;
  dateOrder: 'MDY' | 'DMY' | 'YMD';
  /** Things that did not work, in plain language. Empty is the good case. */
  issues: string[];
}

export interface Bank {
  slug: string;
  name: string;
  /** Market this page targets, e.g. 'DE'. Drives which language links here. */
  country: string;
  currency: string;
  /** How a user gets a readable file out of this bank. Factual, not layout-specific. */
  exportPath: string;
  layoutNotes: LayoutNote[];
  verifications: VerificationRecord[];
}

/** A bank is publishable once a real statement reconciled against its own balance. */
export const PUBLISH_RECONCILE_FLOOR = 0.95;

export function isVerified(bank: Bank): boolean {
  return bank.verifications.some(
    (record) => record.reconcileRate >= PUBLISH_RECONCILE_FLOOR && record.rows >= 3 && record.issues.length <= 1,
  );
}

export function verifiedBanks(): Bank[] {
  return BANKS.filter(isVerified);
}

export function pendingBanks(): Bank[] {
  return BANKS.filter((bank) => !isVerified(bank));
}

export function findBank(slug: string): Bank | undefined {
  return BANKS.find((bank) => bank.slug === slug);
}

/**
 * Banks whose statements we intend to test. None of these is published until a
 * statement from it has reconciled — see the README.
 */
const BANKS: Bank[] = [
  {
    slug: 'chase',
    name: 'Chase',
    country: 'US',
    currency: 'USD',
    exportPath: 'Documents → Statements → download the PDF (not the print preview)',
    layoutNotes: [
      { text: 'Date column is left-aligned and uses MM/DD/YYYY.', state: 'hypothesis' },
      { text: 'Separate "Details" and "Amount" columns with a running "Balance" on the right.', state: 'hypothesis' },
      { text: 'Debits print without a minus sign; direction comes from the Amount column.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'bank-of-america',
    name: 'Bank of America',
    country: 'US',
    currency: 'USD',
    exportPath: 'Statements & Documents → eStatements → download PDF',
    layoutNotes: [
      { text: 'Columns are Date, Description, Amount, Running Bal.', state: 'hypothesis' },
      { text: 'Debits print with a leading minus sign, deposits without one.', state: 'hypothesis' },
      { text: 'Multi-line merchant descriptions are common; the continuation line carries no date.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'wells-fargo',
    name: 'Wells Fargo',
    country: 'US',
    currency: 'USD',
    exportPath: 'Statements & Documents → download PDF, or use the CSV/OFX export for the period',
    layoutNotes: [
      { text: 'A "Daily Balance" summary block is printed and looks like transaction rows.', state: 'hypothesis' },
      { text: 'Some statement cycles print separate withdrawal and deposit column pairs.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'hdfc',
    name: 'HDFC Bank',
    country: 'IN',
    currency: 'INR',
    exportPath: 'NetBanking → Accounts → Statement → download PDF, or request a CSV/OFX export',
    layoutNotes: [
      { text: 'Indian layout: Date, Narration, Chq./Ref.No., Value Dt, Withdrawal Amt., Deposit Amt., Closing Balance.', state: 'hypothesis' },
      { text: 'Amounts use lakh/crore grouping (12,34,567.89), which breaks parsers that group in threes.', state: 'hypothesis' },
      { text: 'Dates are DD/MM/YY.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'icici',
    name: 'ICICI Bank',
    country: 'IN',
    currency: 'INR',
    exportPath: 'iMobile / NetBanking → Statements → download PDF or CSV',
    layoutNotes: [
      { text: 'Column set differs from HDFC; "Transaction Remarks" is the description.', state: 'hypothesis' },
      { text: 'Long remarks are truncated with a trailing "..." in the text layer.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'hsbc',
    name: 'HSBC',
    country: 'GB',
    currency: 'GBP',
    exportPath: 'Online banking → Statements → download PDF or export transactions as OFX',
    layoutNotes: [
      { text: 'Statement prints in either DD/MM or MM/DD depending on the account country.', state: 'hypothesis' },
      { text: 'Balance column is labelled "Balance" and is last.', state: 'hypothesis' },
    ],
    verifications: [],
  },
  {
    slug: 'barclays',
    name: 'Barclays',
    country: 'GB',
    currency: 'GBP',
    exportPath: 'Online banking → Statements → download PDF, or export as CSV/OFX',
    layoutNotes: [
      { text: 'UK statements use DD/MM/YYYY.', state: 'hypothesis' },
      { text: 'Separate "Paid out" and "Paid in" columns plus a "Balance" column.', state: 'hypothesis' },
    ],
    verifications: [],
  },
];

export { BANKS };
