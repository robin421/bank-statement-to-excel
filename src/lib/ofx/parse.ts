/**
 * OFX / QFX parsing.
 *
 * OFX is the file banks hand you when you click "download transactions" — the
 * data is already structured, so there is no layout guessing and no OCR risk.
 * (QFX is Quicken's dialect of the same format.) Supporting it is a small
 * amount of code for a completely different slice of search demand, and it is
 * the honest answer for anyone whose bank exports OFX rather than PDF.
 *
 * Both the SGML-ish OFX 1.x flavour (unclosed tags) and the XML OFX 2.x flavour
 * are handled by the same tag scanner.
 */

import type { StatementResult } from '../parse';
import type { Transaction } from '../parse/transactions';
import { reconcileBalances } from '../parse/reconcile';

export function looksLikeOfx(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096));
  return /OFXHEADER|<OFX>|<STMTTRN>/i.test(head);
}

function tag(block: string, name: string): string | null {
  // Handles <TAG>value (OFX 1.x, unclosed), <TAG>value</TAG> and <TAG/>.
  const match = block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i'));
  if (!match) return null;
  const value = match[1].trim();
  return value ? decodeEntities(value) : null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** OFX dates are `YYYYMMDD[HHMMSS[.mmm[±tz]]]`. */
export function parseOfxDate(raw: string | null): { iso: string | null; time: string | null } {
  if (!raw) return { iso: null, time: null };
  const digits = raw.replace(/\[.*$/, '').replace(/[^\d]/g, '');
  if (digits.length < 8) return { iso: null, time: null };
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const time = digits.length >= 12 ? `${digits.slice(8, 10)}:${digits.slice(10, 12)}` : null;
  return { iso, time };
}

const TRNTYPE_LABEL: Record<string, string> = {
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  INT: 'Interest',
  DIV: 'Dividend',
  FEE: 'Fee',
  SRVCHG: 'Service charge',
  DEP: 'Deposit',
  ATM: 'ATM',
  POS: 'Point of sale',
  XFER: 'Transfer',
  CHECK: 'Cheque',
  PAYMENT: 'Payment',
  CASH: 'Cash',
  DIRECTDEP: 'Direct deposit',
  DIRECTDEBIT: 'Direct debit',
  REPEATPMT: 'Repeating payment',
  OTHER: 'Other',
};

function text(value: string | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function blockFor(source: string, element: string): string | null {
  const start = source.search(new RegExp(`<${element}>`, 'i'));
  if (start < 0) return null;
  const rest = source.slice(start);
  const next = rest.slice(1).search(new RegExp(`</${element}>|<${element}>`, 'i'));
  return next < 0 ? rest : rest.slice(0, next + 1);
}

/**
 * Convert OFX text into the same result shape the PDF pipeline produces, so
 * every exporter works unchanged.
 */
export function parseOfx(source: string, sourceName = 'statement.ofx'): StatementResult {
  const statement = blockFor(source, 'STMTRS') ?? blockFor(source, 'CCSTMTRS') ?? source;
  const ledger = blockFor(source, 'LEDGERBAL');
  const closingBalance = ledger ? Number.parseFloat(tag(ledger, 'BALAMT') ?? '') : Number.NaN;

  const blocks = source.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) ?? [];

  const drafts = blocks.map((block) => {
    const amount = Number.parseFloat((tag(block, 'TRNAMT') ?? '').replace(/,/g, ''));
    const { iso, time } = parseOfxDate(tag(block, 'DTPOSTED') ?? tag(block, 'DTUSER') ?? tag(block, 'DTTRADE'));
    const name = text(tag(block, 'NAME'));
    const memo = text(tag(block, 'MEMO'));
    const checkNumber = text(tag(block, 'CHECKNUM'));
    const type = (tag(block, 'TRNTYPE') ?? '').toUpperCase();
    const fitId = text(tag(block, 'FITID'));

    const descriptionParts = [name, memo && memo !== name ? memo : null, checkNumber ? `Check ${checkNumber}` : null].filter(
      Boolean,
    );

    return {
      amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0,
      iso,
      time,
      type,
      fitId,
      description: descriptionParts.join(' · '),
      raw: block.replace(/\s+/g, ' ').trim(),
    };
  });

  // Rebuild the running balance from the statement's closing balance. This is
  // the same invariant the PDF path uses, and it means the balance column is
  // derived arithmetic rather than a guess.
  const total = drafts.reduce((sum, draft) => sum + draft.amount, 0);
  const opening = Number.isFinite(closingBalance) ? Math.round((closingBalance - total) * 100) / 100 : null;
  let running = opening;

  const transactions: Transaction[] = drafts.map((draft, index) => {
    if (running !== null) running = Math.round((running + draft.amount) * 100) / 100;
    return {
      index,
      page: 1,
      rowIndex: index,
      date: draft.iso,
      dateRaw: draft.iso ?? '',
      description: draft.description || (TRNTYPE_LABEL[draft.type] ?? 'Transaction'),
      debit: draft.amount < 0 ? Math.abs(draft.amount) : null,
      credit: draft.amount > 0 ? draft.amount : null,
      amount: draft.amount,
      balance: running,
      rawText: draft.raw,
      flags: draft.iso ? [] : ['no-date'],
    };
  });

  const reconciliation = reconcileBalances(
    transactions.map((transaction) => transaction.amount),
    transactions.map((transaction) => transaction.balance),
  );

  const currency = text(tag(statement, 'CURDEF'));
  const accountId = text(tag(statement, 'ACCTID'));
  const bankId = text(tag(statement, 'BANKID'));
  const start = parseOfxDate(tag(statement, 'DTSTART')).iso;
  const end = parseOfxDate(tag(statement, 'DTEND')).iso;

  const warnings: string[] = [];
  if (!transactions.length) warnings.push('No transactions were found in this OFX/QFX file.');
  if (!Number.isFinite(closingBalance)) {
    warnings.push('The file has no ledger balance, so a running balance could not be derived.');
  }
  if (start && end) warnings.push(`Statement period: ${start} to ${end}.`);

  return {
    transactions,
    columns: [
      { key: 'date', present: transactions.some((transaction) => Boolean(transaction.date)) },
      { key: 'description', present: transactions.some((transaction) => Boolean(transaction.description)) },
      { key: 'debit', present: transactions.some((transaction) => transaction.amount < 0) },
      { key: 'credit', present: transactions.some((transaction) => transaction.amount > 0) },
      { key: 'amount', present: false },
      { key: 'balance', present: Number.isFinite(closingBalance) },
    ],
    dateOrder: 'YMD',
    dateOrderAmbiguous: false,
    dateOrderEvidence: { mdy: 0, dmy: 0 },
    reconciliation,
    quality: {
      status: transactions.length >= 2 ? 'ok' : 'low_confidence',
      reasons: transactions.length >= 2 ? [] : ['Fewer than two transactions were found in this file.'],
      metrics: {
        pages: 1,
        characters: source.length,
        lettersRatio: 1,
        replacementRatio: 0,
        transactions: transactions.length,
        reconcilePassRate: reconciliation.passRate,
        reconcileChecked: reconciliation.checked,
      },
    },
    warnings,
    meta: {
      pages: 1,
      hypothesis: 'OFX structured data',
      hypothesisScore: 1,
      alternatives: [],
      detectedBands: 0,
      headerRow: null,
      source: 'ofx',
      account: [bankId, accountId].filter(Boolean).join(' '),
      currency: currency || undefined,
    } as StatementResult['meta'],
  };
}
