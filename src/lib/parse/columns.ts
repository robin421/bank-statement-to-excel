import { clusterBy, median } from './cluster';
import { parseAmount, isAmountLike } from './amount';
import { parseDate } from './date';
import type { Row, TextCell } from './rows';

export type CellKind = 'date' | 'money' | 'weak_number' | 'text';

export interface ColumnBand {
  id: string;
  kind: 'date' | 'money' | 'text';
  /** Left edge of the band. */
  left: number;
  /** Right edge of the band. */
  right: number;
  /** Value used for band matching: right edge for right-aligned money, else left edge. */
  anchor: number;
  /** How many cells landed in this band. */
  count: number;
  /** Header label matched to this band, when a header row was found. */
  label?: string;
  task?: HeaderTask;
}

export type HeaderTask = 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance';

export interface ColumnModel {
  bands: ColumnBand[];
  dateBands: ColumnBand[];
  moneyBands: ColumnBand[];
  /** Horizontal window that holds free-text description cells. */
  descriptionLeft: number;
  descriptionRight: number;
  tableLeft: number;
  tableRight: number;
  headerRowIndex: number | null;
  headerLabels: Array<{ text: string; x: number; right: number; task: HeaderTask }>;
}

const HEADER_RULES: Array<{ pattern: RegExp; task: HeaderTask }> = [
  { pattern: /^(running\s+)?bal(ance)?\.?$/i, task: 'balance' },
  { pattern: /closing\s+bal/i, task: 'balance' },
  { pattern: /^(balance|bal)\b/i, task: 'balance' },
  { pattern: /withdrawal|withdrawals|paid\s*out|money\s*out|debit|dr\.?\b|payments?\s*out/i, task: 'debit' },
  { pattern: /deposit|deposits|paid\s*in|money\s*in|credit|cr\.?\b|payments?\s*in/i, task: 'credit' },
  { pattern: /^amount\b|^amt\b/i, task: 'amount' },
  { pattern: /^(value\s*dt|value\s*date|post\s*date|txn\s*date|transaction\s*date|date)\b/i, task: 'date' },
  { pattern: /desc|detail|narration|particular|remark|merchant|payee|memo|transaction|reference|narrative/i, task: 'description' },
];

export function classifyCell(cell: TextCell): CellKind {
  const text = cell.str.trim();
  if (!text) return 'text';

  const amount = parseAmount(text);
  // A currency symbol, a sign, or grouping punctuation is proof of money —
  // otherwise `31.12` and `01/02` are genuinely indistinguishable.
  const moneySignal = Boolean(amount && amount.strong && (amount.currency || amount.negative || /[,(]/.test(text)));

  if (!moneySignal && (parseDate(text, 'MDY') || parseDate(text, 'DMY'))) return 'date';
  if (amount && isAmountLike(text)) return 'money';
  if (amount) return 'weak_number';
  return 'text';
}

function headerTaskFor(text: string): HeaderTask | null {
  const cleaned = text.trim().replace(/[*:]/g, '');
  if (!cleaned) return null;
  for (const rule of HEADER_RULES) {
    if (rule.pattern.test(cleaned)) return rule.task;
  }
  return null;
}

/**
 * Find the header row and return its labelled columns.
 * Statements repeat the header on every page, so we take the row with the most
 * recognisable labels rather than the first match.
 */
function findHeader(rows: Row[]): { index: number; labels: ColumnModel['headerLabels'] } | null {
  let best: { index: number; labels: ColumnModel['headerLabels']; score: number } | null = null;

  for (let index = 0; index < Math.min(rows.length, 60); index += 1) {
    const labels: ColumnModel['headerLabels'] = [];
    for (const cell of rows[index].cells) {
      const task = headerTaskFor(cell.str);
      if (task) labels.push({ text: cell.str.trim(), x: cell.x, right: cell.x + cell.w, task });
    }
    const distinct = new Set(labels.map((label) => label.task)).size;
    if (distinct >= 2 && (!best || distinct > best.score)) best = { index, labels, score: distinct };
  }

  return best ? { index: best.index, labels: best.labels } : null;
}

/**
 * Build the column model.
 *
 * Columns are found from the *content*, not from whitespace gaps: statements are
 * right-aligned on money, so right edges cluster tightly even when the numbers
 * are different widths. Projection profiles (the classic approach) shatter on
 * variable-width descriptions, so we anchor on the columns we actually need.
 */
export function detectColumns(rows: Row[]): ColumnModel {
  const allCells: TextCell[] = rows.flatMap((row) => row.cells);
  const tableLeft = allCells.length ? Math.min(...allCells.map((cell) => cell.x)) : 0;
  const tableRight = allCells.length ? Math.max(...allCells.map((cell) => cell.x + cell.w)) : 0;

  const bodyHeight = median(rows.map((row) => row.height).filter((h) => h > 0 && h < 200)) || 10;

  const dateCells: TextCell[] = [];
  const moneyCells: TextCell[] = [];
  const weakCells: TextCell[] = [];

  for (const cell of allCells) {
    const kind = classifyCell(cell);
    if (kind === 'date') dateCells.push(cell);
    else if (kind === 'money') moneyCells.push(cell);
    else if (kind === 'weak_number') weakCells.push(cell);
  }

  const header = findHeader(rows);
  const bands: ColumnBand[] = [];

  const dateClusters = clusterBy(dateCells, (cell) => cell.x, Math.max(6, bodyHeight * 0.9)).filter(
    (cluster) => cluster.members.length >= 2,
  );
  for (const cluster of dateClusters) {
    bands.push({
      id: `date-${bands.length}`,
      kind: 'date',
      left: cluster.min,
      right: Math.max(...cluster.members.map((cell) => cell.x + cell.w)),
      anchor: cluster.centre,
      count: cluster.members.length,
    });
  }

  const moneySource = moneyCells.length >= 3 ? moneyCells : [...moneyCells, ...weakCells];
  const moneyClusters = clusterBy(moneySource, (cell) => cell.x + cell.w, Math.max(5, bodyHeight * 0.7)).filter(
    (cluster) => cluster.members.length >= 2,
  );
  for (const cluster of moneyClusters) {
    bands.push({
      id: `money-${bands.length}`,
      kind: 'money',
      left: Math.min(...cluster.members.map((cell) => cell.x)),
      right: Math.max(...cluster.members.map((cell) => cell.x + cell.w)),
      anchor: cluster.centre,
      count: cluster.members.length,
    });
  }

  bands.sort((a, b) => a.left - b.left);

  // Attach header labels: money is right-aligned (match on the right edge), text
  // columns are left-aligned (match on the left edge).
  if (header) {
    for (const band of bands) {
      const reference = band.kind === 'money' ? band.right : band.left;
      let bestLabel: ColumnModel['headerLabels'][number] | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const label of header.labels) {
        const labelReference = band.kind === 'money' ? label.right : label.x;
        const distance = Math.abs(labelReference - reference);
        const tolerance = Math.max(24, bodyHeight * 2.4);
        if (distance < bestDistance && distance <= tolerance) {
          bestDistance = distance;
          bestLabel = label;
        }
      }
      if (bestLabel) {
        band.label = bestLabel.text;
        band.task = bestLabel.task;
      }
    }
  }

  const dateBands = bands.filter((band) => band.kind === 'date');
  const moneyBands = bands.filter((band) => band.kind === 'money');

  const primaryDate = dateBands[0];
  const firstMoneyLeft = moneyBands.length ? Math.min(...moneyBands.map((band) => band.left)) : tableRight;
  const descriptionLeft = primaryDate ? primaryDate.right : tableLeft;
  const descriptionRight = Math.max(descriptionLeft, firstMoneyLeft - bodyHeight * 0.5);

  // A header cell labelled "description" is a much better boundary than a guess.
  const descriptionLabel = header?.labels.find((label) => label.task === 'description');
  const finalDescriptionLeft = descriptionLabel ? descriptionLabel.x - bodyHeight * 0.6 : descriptionLeft;

  return {
    bands,
    dateBands,
    moneyBands,
    descriptionLeft: finalDescriptionLeft,
    descriptionRight,
    tableLeft,
    tableRight,
    headerRowIndex: header?.index ?? null,
    headerLabels: header?.labels ?? [],
  };
}

export function isInBand(cell: TextCell, band: ColumnBand, tolerance = 6): boolean {
  const centre = cell.x + cell.w / 2;
  return centre >= band.left - tolerance && centre <= band.right + tolerance;
}

/**
 * Pick the band a cell belongs to.
 *
 * Bands can overlap — a right-aligned amount and a right-aligned balance sit at
 * different x but their cells can span similar ranges — so "first band that
 * contains the centre" is not good enough. Nearest anchor wins, which is stable
 * because anchors are what the bands were clustered on.
 */
export function bandForCell(cell: TextCell, bands: ColumnBand[], tolerance = 10): ColumnBand | undefined {
  const centre = cell.x + cell.w / 2;
  let best: ColumnBand | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    if (centre < band.left - tolerance || centre > band.right + tolerance) continue;
    const distance = Math.abs(band.anchor - centre);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = band;
    }
  }
  return best;
}
