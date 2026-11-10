/**
 * No Tax on Tips (IRC §224) and No Tax on Overtime (IRC §225), P.L. 119-21.
 * Every number here is copied from an IRS source; see SOURCES in content.ts.
 * Checked 2026-11-10.
 */

export type FilingStatus = 'single' | 'hoh' | 'mfj' | 'qss' | 'mfs';
export type TaxYear = 2025 | 2026;

export const RULES = {
  /** Tax years 2025 through 2028 (FS-2025-03; IRC §224(h), §225(f)). */
  firstYear: 2025,
  lastYear: 2028,
  /** Per return, every filing status — Schedule 1-A Part II. */
  tipsCap: 25_000,
  /** Schedule 1-A Part III: $12,500, $25,000 if married filing jointly. */
  overtimeCap: { joint: 25_000, other: 12_500 },
  /** Phase-out threshold, both deductions: $150,000, $300,000 joint. */
  phaseOutStart: { joint: 300_000, other: 150_000 },
  /** $100 for each full $1,000 over the threshold (Sch. 1-A: divide by 1,000, round down). */
  reductionPerStep: 100,
  stepSize: 1_000,
} as const;

/** 2026 federal rates and standard deduction — Rev. Proc. 2025-32, §.01 Tables 1–3 and §.14. */
export const FEDERAL_2026 = {
  standardDeduction: { mfj: 32_200, qss: 32_200, hoh: 24_150, single: 16_100, mfs: 16_100 },
  /** [lower bound of bracket, rate]. Table 1 (MFJ & surviving spouses), 2 (HoH), 3 (single). */
  brackets: {
    mfj: [[0, 0.1], [24_800, 0.12], [100_800, 0.22], [211_400, 0.24], [403_550, 0.32], [512_450, 0.35], [768_700, 0.37]],
    hoh: [[0, 0.1], [17_700, 0.12], [67_450, 0.22], [105_700, 0.24], [201_750, 0.32], [256_200, 0.35], [640_600, 0.37]],
    single: [[0, 0.1], [12_400, 0.12], [50_400, 0.22], [105_700, 0.24], [201_775, 0.32], [256_225, 0.35], [640_600, 0.37]],
  },
} as const;

const isJoint = (s: FilingStatus) => s === 'mfj';

const pos = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const toAmount = pos;

/** Floor(max(0, MAGI − threshold) / 1,000) × $100. */
export function phaseOutReduction(magi: number, status: FilingStatus): number {
  const threshold = isJoint(status) ? RULES.phaseOutStart.joint : RULES.phaseOutStart.other;
  const excess = pos(magi) - threshold;
  if (excess <= 0) return 0;
  return Math.floor(excess / RULES.stepSize) * RULES.reductionPerStep;
}

/** Ordinary federal income tax on taxable income for 2026 (Rev. Proc. 2025-32). */
export function federalTax2026(taxableIncome: number, status: FilingStatus): number {
  const table =
    status === 'mfj' || status === 'qss'
      ? FEDERAL_2026.brackets.mfj
      : status === 'hoh'
        ? FEDERAL_2026.brackets.hoh
        : status === 'single'
          ? FEDERAL_2026.brackets.single
          : null;
  if (!table) throw new Error('No 2026 table wired for this filing status');
  const ti = pos(taxableIncome);
  let tax = 0;
  for (let i = 0; i < table.length; i++) {
    const [lo, rate] = table[i];
    const hi = i + 1 < table.length ? table[i + 1][0] : Infinity;
    if (ti <= lo) break;
    tax += (Math.min(ti, hi) - lo) * rate;
  }
  return Math.round(tax * 100) / 100;
}

export interface Eligibility {
  taxYear: number;
  filingStatus: FilingStatus;
  validSsn: boolean;
}

function ineligibleReason({ taxYear, filingStatus, validSsn }: Eligibility): string | null {
  if (!(taxYear >= RULES.firstYear && taxYear <= RULES.lastYear))
    return `These deductions only exist for tax years ${RULES.firstYear}–${RULES.lastYear}.`;
  if (filingStatus === 'mfs') return 'Married filing separately can’t claim this deduction — married taxpayers must file a joint return.';
  if (!validSsn) return 'The person who received the pay needs a Social Security number valid for employment.';
  return null;
}

export interface DeductionResult {
  eligible: boolean;
  reason: string | null;
  qualified: number;
  cap: number;
  capped: number;
  reduction: number;
  deduction: number;
  /** null when we have no verified rate table for the year. */
  taxSaved: number | null;
  notes: string[];
}

/** Tax saved = tax(before) − tax(after), using the 2026 tables. Only 2026 is wired. */
export function taxSaved(opts: {
  taxYear: number;
  filingStatus: FilingStatus;
  agi: number;
  /** Standard or itemized deduction. Defaults to the 2026 standard deduction. */
  belowLineDeduction?: number;
  newDeduction: number;
}): number | null {
  if (opts.taxYear !== 2026 || opts.filingStatus === 'mfs') return null;
  const std = opts.belowLineDeduction ?? FEDERAL_2026.standardDeduction[opts.filingStatus];
  const before = Math.max(0, pos(opts.agi) - pos(std));
  const after = Math.max(0, before - pos(opts.newDeduction));
  return Math.round(federalTax2026(before, opts.filingStatus) - federalTax2026(after, opts.filingStatus));
}

function finish(
  e: Eligibility,
  qualified: number,
  cap: number,
  magi: number,
  belowLineDeduction: number | undefined,
  notes: string[],
): DeductionResult {
  const reason = ineligibleReason(e);
  if (reason) return { eligible: false, reason, qualified, cap, capped: 0, reduction: 0, deduction: 0, taxSaved: 0, notes };
  const capped = Math.min(qualified, cap);
  const reduction = phaseOutReduction(magi, e.filingStatus);
  const deduction = Math.max(0, capped - reduction);
  if (qualified > cap) notes.push(`Only the first $${cap.toLocaleString('en-US')} counts — that is the cap for this filing status.`);
  if (reduction > 0) notes.push(`Your MAGI is over the threshold, so the deduction is reduced by $${reduction.toLocaleString('en-US')}.`);
  return {
    eligible: true,
    reason: null,
    qualified,
    cap,
    capped,
    reduction: Math.min(reduction, capped),
    deduction,
    taxSaved: taxSaved({ taxYear: e.taxYear, filingStatus: e.filingStatus, agi: magi, belowLineDeduction, newDeduction: deduction }),
    notes,
  };
}

/** FLSA premium only: 0.5 × regular rate × FLSA overtime hours, whatever the multiplier paid. */
export function estimateOvertimePremium(regularRate: number, overtimeHours: number): number {
  return Math.round(pos(regularRate) * 0.5 * pos(overtimeHours) * 100) / 100;
}

export interface OvertimeInput extends Eligibility {
  magi: number;
  /** W-2 box 12 code TT amounts (yours, and your spouse's on a joint return). */
  ttAmounts: number[];
  flsaNonExempt: boolean;
  belowLineDeduction?: number;
}

export function overtimeDeduction(input: OvertimeInput): DeductionResult {
  const notes: string[] = [];
  const cap = isJoint(input.filingStatus) ? RULES.overtimeCap.joint : RULES.overtimeCap.other;
  const amounts = input.filingStatus === 'mfj' ? input.ttAmounts : input.ttAmounts.slice(0, 1);
  const qualified = amounts.reduce((s, v) => s + pos(v), 0);
  if (!input.flsaNonExempt) {
    return {
      eligible: false,
      reason: 'Only overtime the FLSA requires counts. If you are FLSA-exempt, your overtime pay doesn’t qualify.',
      qualified, cap, capped: 0, reduction: 0, deduction: 0, taxSaved: 0, notes,
    };
  }
  return finish(input, qualified, cap, input.magi, input.belowLineDeduction, notes);
}

export interface TipsInput extends Eligibility {
  magi: number;
  /** Treasury Tipped Occupation Code from W-2 box 14b / your occupation; '000' or '' = not qualifying. */
  occupationCode: string;
  /** W-2 box 12 code TP. */
  w2Tips: number;
  /** Qualified tips included in Form 1099-NEC box 1, 1099-MISC box 3 or 1099-K box 1a. */
  selfEmployedTips: number;
  /** Net profit of that trade or business; undefined = not self-employed / not entered. */
  selfEmployedNetProfit?: number;
  voluntaryTips: boolean;
  belowLineDeduction?: number;
}

export function tipsDeduction(input: TipsInput): DeductionResult {
  const notes: string[] = [];
  const cap = RULES.tipsCap;
  const code = (input.occupationCode ?? '').trim();
  const zeroed = (reason: string): DeductionResult => ({
    eligible: false, reason, qualified: 0, cap, capped: 0, reduction: 0, deduction: 0, taxSaved: 0, notes,
  });
  if (code === '000') return zeroed('Occupation code 000 means a non-qualifying occupation, so these tips are not qualified tips.');
  if (!/^\d{3}$/.test(code)) return zeroed('Pick your occupation. Only tips earned in an occupation on the IRS list can be deducted.');
  if (!input.voluntaryTips) return zeroed('Only voluntary tips count. Mandatory service charges are not qualified tips unless the customer can remove or change them.');
  const se = pos(input.selfEmployedTips);
  const seAllowed = input.selfEmployedNetProfit === undefined ? se : Math.min(se, pos(input.selfEmployedNetProfit));
  if (seAllowed < se) notes.push('Self-employed tips are limited to the net profit of the business you earned them in.');
  const qualified = pos(input.w2Tips) + seAllowed;
  return finish(input, qualified, cap, input.magi, input.belowLineDeduction, notes);
}
