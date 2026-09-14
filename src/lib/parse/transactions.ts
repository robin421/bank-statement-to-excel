import { bandForCell, classifyCell, isInBand, type ColumnBand, type ColumnModel } from './columns';
import { normalizeRowKey, type Row, type TextCell } from './rows';
import { parseAmount, type ParsedAmount } from './amount';
import { parseDate, type DateOrder } from './date';
import { balancesAgree, flippedSignSatisfies, reconcileBalances, type ReconcileReport } from './reconcile';
import { median } from './cluster';

export type MoneyRole = 'debit' | 'credit' | 'amount' | 'balance';

export interface Transaction {
  index: number;
  page: number;
  rowIndex: number;
  /** ISO date when the year could be resolved, otherwise a partial form. */
  date: string | null;
  dateRaw: string | null;
  description: string;
  debit: number | null;
  credit: number | null;
  /** Signed net movement. Negative = money out. */
  amount: number;
  balance: number | null;
  rawText: string;
  flags: string[];
}

export interface RoleHypothesis {
  id: string;
  label: string;
  roles: Map<string, MoneyRole>;
  prior: number;
}

export interface RankedHypothesis extends RoleHypothesis {
  score: number;
  reconciliation: ReconcileReport;
  transactions: Transaction[];
  filled: number;
}

export interface BuildOptions {
  dateOrder: DateOrder;
  fallbackYear: number | null;
}

const NON_TRANSACTION_ROW =
  /^(beginning|opening|balance\s*(brought|carried|forward)|b\/f|c\/f|total|sub-?total|ending|closing\s+balance|minimum\s+payment|amount\s+due|summary|continued|page\s+\d|this\s+(is|statement)|important|please\s+note|member\s+fdic|equal\s+housing|deposits?\s+may\s+not)/i;

/** Rows that repeat verbatim on most pages are page furniture, not data. */
export function findNoiseRowIndexes(rows: Row[], pageCount: number): Set<number> {
  const noise = new Set<number>();
  if (pageCount < 2) return noise;

  const byKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${Math.round(row.y / 6)}|${normalizeRowKey(row.text)}`;
    if (!key.endsWith('|')) {
      const list = byKey.get(key);
      if (list) list.push(index);
      else byKey.set(key, [index]);
    }
  });

  const threshold = Math.max(2, Math.ceil(pageCount * 0.6));
  for (const indexes of byKey.values()) {
    const pages = new Set(indexes.map((index) => rows[index].page));
    if (pages.size < threshold) continue;
    for (const index of indexes) {
      // A row carrying a standalone date is always data, never furniture.
      if (!rows[index].cells.some((cell) => classifyCell(cell) === 'date')) noise.add(index);
    }
  }

  return noise;
}

/** Per-page vertical window that actually contains transactions. */
function tableBoundsByPage(rows: Row[]): Map<number, { top: number; bottom: number }> {
  const dateYs = new Map<number, number[]>();
  const heights: number[] = [];

  for (const row of rows) {
    heights.push(row.height);
    if (row.cells.some((cell) => classifyCell(cell) === 'date')) {
      const list = dateYs.get(row.page);
      if (list) list.push(row.y);
      else dateYs.set(row.page, [row.y]);
    }
  }

  const pad = Math.max(6, (median(heights) || 10) * 4);
  const bounds = new Map<number, { top: number; bottom: number }>();
  for (const [page, ys] of dateYs) {
    bounds.set(page, { top: Math.min(...ys) - pad, bottom: Math.max(...ys) + pad });
  }
  return bounds;
}

function cellInDescription(cell: TextCell, model: ColumnModel): boolean {
  if (model.dateBands.some((band) => isInBand(cell, band, 4))) return false;
  if (model.moneyBands.some((band) => isInBand(cell, band, 4))) return false;
  return true;
}

interface RowMoney {
  bandId: string;
  parsed: ParsedAmount;
}

function moneyForRow(row: Row, model: ColumnModel): RowMoney[] {
  const found: RowMoney[] = [];
  for (const cell of row.cells) {
    const kind = classifyCell(cell);
    if (kind !== 'money' && kind !== 'weak_number') continue;
    const band = bandForCell(cell, model.moneyBands);
    if (!band) continue;
    const parsed = parseAmount(cell.str);
    if (!parsed) continue;
    found.push({ bandId: band.id, parsed });
  }
  return found;
}

/** All plausible ways the detected money columns could map onto statement roles. */
export function hypothesiseRoles(model: ColumnModel): RoleHypothesis[] {
  const bands = [...model.moneyBands].sort((a, b) => a.left - b.left);
  const hypotheses: RoleHypothesis[] = [];
  const map = (entries: Array<[ColumnBand, MoneyRole]>, label: string, prior: number, id: string) =>
    hypotheses.push({
      id,
      label,
      roles: new Map(entries.map(([band, role]) => [band.id, role])),
      prior,
    });

  const labelled = bands.filter((band) => band.task);
  if (labelled.length) {
    const entries: Array<[ColumnBand, MoneyRole]> = [];
    for (const band of bands) {
      if (band.task === 'balance') entries.push([band, 'balance']);
      else if (band.task === 'debit') entries.push([band, 'debit']);
      else if (band.task === 'credit') entries.push([band, 'credit']);
      else if (band.task === 'amount') entries.push([band, 'amount']);
    }
    const unpinned = bands.filter((band) => !band.task);
    const usedRoles = new Set(entries.map(([, role]) => role));
    for (const band of unpinned) {
      if (!usedRoles.has('debit') && unpinned.length > 1) {
        entries.push([band, 'debit']);
        usedRoles.add('debit');
      } else if (!usedRoles.has('credit') && unpinned.length > 1) {
        entries.push([band, 'credit']);
        usedRoles.add('credit');
      } else if (!usedRoles.has('amount') && unpinned.length === 1) {
        entries.push([band, 'amount']);
        usedRoles.add('amount');
      } else if (!usedRoles.has('balance')) {
        entries.push([band, 'balance']);
        usedRoles.add('balance');
      }
    }
    if (entries.length && entries.some(([, role]) => role === 'balance' || role === 'amount' || role === 'debit')) {
      map(entries, 'header labels', 0.06, 'header');
    }
  }

  if (bands.length === 1) {
    map([[bands[0], 'amount']], 'single amount column', 0.02, 'single-amount');
  }

  if (bands.length === 2) {
    map([[bands[0], 'debit'], [bands[1], 'credit']], 'debit + credit', 0.05, 'debit-credit');
    map([[bands[0], 'amount'], [bands[1], 'balance']], 'amount + balance', 0.04, 'amount-balance');
    map([[bands[0], 'debit'], [bands[1], 'balance']], 'debit + balance', 0.02, 'debit-balance');
  }

  if (bands.length === 3) {
    map([[bands[0], 'debit'], [bands[1], 'credit'], [bands[2], 'balance']], 'debit + credit + balance', 0.06, 'debit-credit-balance');
    map([[bands[0], 'amount'], [bands[1], 'credit'], [bands[2], 'balance']], 'amount + credit + balance', 0.02, 'amount-credit-balance');
  }

  if (bands.length >= 4) {
    const tail = bands.slice(-3);
    map([[tail[0], 'debit'], [tail[1], 'credit'], [tail[2], 'balance']], 'debit + credit + balance (rightmost three)', 0.05, 'dcb-tail');
    const pair = bands.slice(-2);
    map([[pair[0], 'amount'], [pair[1], 'balance']], 'amount + balance (rightmost two)', 0.03, 'ab-tail');
  }

  return hypotheses;
}

interface AssembledRow {
  transaction: Omit<Transaction, 'debit' | 'credit' | 'amount' | 'balance'>;
  /** Money cells found on this row, resolved to a column band. */
  money: RowMoney[];
}

function assembleRows(rows: Row[], model: ColumnModel, noise: Set<number>, options: BuildOptions): AssembledRow[] {
  const bounds = tableBoundsByPage(rows);
  const out: AssembledRow[] = [];
  let current: AssembledRow | null = null;

  rows.forEach((row, rowIndex) => {
    if (noise.has(rowIndex)) return;

    const pageBounds = bounds.get(row.page);
    const inTable = pageBounds ? row.y >= pageBounds.top && row.y <= pageBounds.bottom : false;

    const dateCell = row.cells.find(
      (cell) => model.dateBands.some((band) => isInBand(cell, band)) && classifyCell(cell) === 'date',
    );
    const parsedDate = dateCell ? parseDate(dateCell.str, options.dateOrder, options.fallbackYear) : null;

    if (dateCell && parsedDate) {
      const description = row.cells
        .filter((cell) => cellInDescription(cell, model))
        .map((cell) => cell.str.trim())
        .filter(Boolean)
        .join(' ');

      current = {
        transaction: {
          index: out.length,
          page: row.page,
          rowIndex,
          date: parsedDate.iso,
          dateRaw: dateCell.str.trim(),
          description: description.replace(/\s+/g, ' ').trim(),
          rawText: row.text,
          flags: [],
        },
        money: moneyForRow(row, model),
      };
      out.push(current);
      return;
    }

    if (!current || !inTable) return;
    if (NON_TRANSACTION_ROW.test(row.text.trim())) return;

    const money = moneyForRow(row, model);
    const description = row.cells
      .filter((cell) => cellInDescription(cell, model))
      .map((cell) => cell.str.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (description && description.length <= 160) {
      current.transaction.description = `${current.transaction.description} ${description}`.trim();
      current.transaction.flags.push('multiline-description');
    }

    if (money.length && !current.money.length) {
      current.money.push(...money);
      current.transaction.flags.push('amount-on-continuation-row');
    }
  });

  return out;
}

function buildWithRoles(assembled: AssembledRow[], roles: Map<string, MoneyRole>, model: ColumnModel): Transaction[] {
  const hasDebit = [...roles.values()].includes('debit');
  const hasCredit = [...roles.values()].includes('credit');

  return assembled.map((entry) => {
    const flags = [...entry.transaction.flags];
    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;
    let amount = 0;

    for (const { bandId, parsed } of entry.money) {
      const role = roles.get(bandId);
      if (!role) continue;
      if (role === 'balance') balance = parsed.value;
      else if (role === 'debit') debit = (debit ?? 0) + parsed.magnitude;
      else if (role === 'credit') credit = (credit ?? 0) + parsed.magnitude;
      else amount += parsed.value;
    }

    if (hasDebit || hasCredit) {
      const out = debit ?? 0;
      const into = credit ?? 0;
      if (out && into) flags.push('both-debit-and-credit');
      amount += into - out;
    }

    if (!entry.money.length) flags.push('amount-not-found');
    if (balance === null && [...roles.values()].includes('balance')) flags.push('balance-not-found');

    void model;
    return {
      ...entry.transaction,
      flags,
      debit,
      credit,
      amount: Math.round(amount * 100) / 100,
      balance,
    };
  });
}

/**
 * Correct unsigned debit columns using the running balance.
 * Banks frequently print debits as positive numbers with the direction implied
 * by which column they sit in; when the column model got that wrong, the
 * balance chain is the only thing that can tell us.
 */
function correctSigns(transactions: Transaction[]): number {
  let corrections = 0;
  for (let index = 1; index < transactions.length; index += 1) {
    const previous = transactions[index - 1].balance;
    const current = transactions[index];
    if (previous === null || current.balance === null || current.amount === 0) continue;
    if (balancesAgree(previous + current.amount, current.balance)) continue;
    if (flippedSignSatisfies(previous, current.amount, current.balance)) {
      current.amount = Math.round(-current.amount * 100) / 100;
      current.flags.push('sign-corrected');
      corrections += 1;
    }
  }
  return corrections;
}

/**
 * Rank role hypotheses. The running balance is the oracle: a hypothesis that
 * explains the balance chain wins, even over a header label, because header
 * labels are frequently wrong or missing while arithmetic is not.
 */
export function rankRoleHypotheses(rows: Row[], model: ColumnModel, options: BuildOptions): RankedHypothesis[] {
  const noise = findNoiseRowIndexes(rows, new Set(rows.map((row) => row.page)).size);
  const assembled = assembleRows(rows, model, noise, options);
  const hypotheses = hypothesiseRoles(model);

  const ranked: RankedHypothesis[] = hypotheses.map((hypothesis) => {
    const transactions = buildWithRoles(assembled, hypothesis.roles, model);
    correctSigns(transactions);
    const amounts = transactions.map((transaction) => transaction.amount);
    const balances = transactions.map((transaction) => transaction.balance);
    const report = reconcileBalances(amounts, balances);
    const hasBalance = [...hypothesis.roles.values()].includes('balance');
    const filled = transactions.filter((transaction) => transaction.amount !== 0 || transaction.balance !== null).length;

    // Require real evidence before trusting a balance column.
    const balanceScore = hasBalance && report.checked >= 2 ? report.passRate : 0;
    const coverage = transactions.length ? filled / transactions.length : 0;

    // In a debit/credit layout only one of the two columns is ever populated;
    // in an amount/balance layout both usually are on every row.
    let priorAdjustment = 0;
    const bothPopulated = transactions.length
      ? transactions.filter((transaction) => transaction.debit && transaction.credit).length / transactions.length
      : 0;
    if (!hasBalance && bothPopulated < 0.2) priorAdjustment += 0.03;

    return {
      ...hypothesis,
      transactions,
      reconciliation: report,
      filled,
      score: balanceScore * 0.8 + coverage * 0.2 + hypothesis.prior + priorAdjustment,
    };
  });

  return ranked.sort((a, b) => b.score - a.score);
}
