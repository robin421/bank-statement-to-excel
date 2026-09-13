import type { ReconcileReport } from './reconcile';
import type { Transaction } from './transactions';
import type { PdfPageText } from '../pdf/types';

export type QualityStatus = 'ok' | 'low_confidence' | 'needs_ocr';

export interface QualityReport {
  status: QualityStatus;
  reasons: string[];
  metrics: {
    pages: number;
    characters: number;
    lettersRatio: number;
    replacementRatio: number;
    transactions: number;
    reconcilePassRate: number;
    reconcileChecked: number;
  };
}

const REPLACEMENT = /\uFFFD/g;

/**
 * Decide whether to trust the output.
 *
 * The product promise is "no plausible-but-wrong rows". When a PDF has a fake
 * text layer (scans with an invisible OCR layer, or broken font encodings) the
 * heuristics will happily invent transactions, so this gate runs before the UI
 * is allowed to claim success.
 */
export function assessQuality(pages: PdfPageText[], transactions: Transaction[], reconciliation: ReconcileReport): QualityReport {
  const text = pages.flatMap((page) => page.items.map((item) => item.str)).join(' ');
  const characters = text.replace(/\s/g, '').length;
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const replacements = (text.match(REPLACEMENT) ?? []).length;
  const perPage = pages.length ? characters / pages.length : 0;

  const lettersRatio = characters ? letters / characters : 0;
  const replacementRatio = characters ? replacements / characters : 0;

  const reasons: string[] = [];
  let status: QualityStatus = 'ok';

  if (perPage < 40) {
    status = 'needs_ocr';
    reasons.push('Almost no selectable text was found, so this is probably a scan.');
  } else if (lettersRatio < 0.25) {
    status = 'needs_ocr';
    reasons.push('The text layer contains mostly symbols and numbers rather than words, which usually means a broken font encoding.');
  } else if (replacementRatio > 0.03) {
    status = 'needs_ocr';
    reasons.push('A large share of characters failed to decode, which usually means a scanned or unusually encoded PDF.');
  }

  if (status !== 'needs_ocr') {
    if (transactions.length < 2) {
      status = 'low_confidence';
      reasons.push('Fewer than two transactions were recognised. Check the preview before using the file.');
    } else if (reconciliation.checked >= 3 && reconciliation.passRate < 0.8) {
      status = 'low_confidence';
      reasons.push(
        `Only ${reconciliation.matched} of ${reconciliation.checked} rows reconcile against the statement balance, so some rows may be misread.`,
      );
    } else if (transactions.filter((transaction) => transaction.amount === 0).length > transactions.length * 0.5) {
      status = 'low_confidence';
      reasons.push('Most rows have no readable amount — the amount column may not have been detected.');
    }
  }

  return {
    status,
    reasons,
    metrics: {
      pages: pages.length,
      characters,
      lettersRatio,
      replacementRatio,
      transactions: transactions.length,
      reconcilePassRate: reconciliation.passRate,
      reconcileChecked: reconciliation.checked,
    },
  };
}
