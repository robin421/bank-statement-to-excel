import { describe, expect, it } from 'vitest';
import {
  estimateOvertimePremium,
  federalTax2026,
  overtimeDeduction,
  phaseOutReduction,
  taxSaved,
  tipsDeduction,
  type OvertimeInput,
  type TipsInput,
} from '../src/lib/tax/rules';

const ot = (o: Partial<OvertimeInput> = {}): OvertimeInput => ({
  taxYear: 2026, filingStatus: 'single', validSsn: true, flsaNonExempt: true, magi: 60_000, ttAmounts: [0], ...o,
});
const tips = (o: Partial<TipsInput> = {}): TipsInput => ({
  taxYear: 2026, filingStatus: 'single', validSsn: true, voluntaryTips: true, magi: 38_000,
  occupationCode: '102', w2Tips: 0, selfEmployedTips: 0, ...o,
});

describe('2026 federal tax tables (Rev. Proc. 2025-32)', () => {
  it('single bracket boundaries match Table 3 base amounts', () => {
    expect(federalTax2026(12_400, 'single')).toBe(1_240);
    expect(federalTax2026(50_400, 'single')).toBe(5_800);
    expect(federalTax2026(105_700, 'single')).toBe(17_966);
    expect(federalTax2026(201_775, 'single')).toBe(41_024);
    expect(federalTax2026(256_225, 'single')).toBe(58_448);
    expect(federalTax2026(640_600, 'single')).toBe(192_979.25);
  });
  it('MFJ (Table 1) and HoH (Table 2) base amounts', () => {
    expect(federalTax2026(24_800, 'mfj')).toBe(2_480);
    expect(federalTax2026(100_800, 'mfj')).toBe(11_600);
    expect(federalTax2026(211_400, 'mfj')).toBe(35_932);
    expect(federalTax2026(403_550, 'mfj')).toBe(82_048);
    expect(federalTax2026(512_450, 'mfj')).toBe(116_896);
    expect(federalTax2026(768_700, 'mfj')).toBe(206_583.5);
    expect(federalTax2026(17_700, 'hoh')).toBe(1_770);
    expect(federalTax2026(67_450, 'hoh')).toBe(7_740);
    expect(federalTax2026(105_700, 'hoh')).toBe(16_155);
    expect(federalTax2026(201_750, 'hoh')).toBe(39_207);
    expect(federalTax2026(256_200, 'hoh')).toBe(56_631);
    expect(federalTax2026(640_600, 'hoh')).toBe(191_171);
  });
  it('surviving spouse uses Table 1; zero/negative income is zero tax', () => {
    expect(federalTax2026(24_800, 'qss')).toBe(2_480);
    expect(federalTax2026(-5, 'single')).toBe(0);
  });
  it('savings use the tax difference, not deduction × marginal rate, across a bracket edge', () => {
    // Single, AGI 70,000 → taxable 53,900 (22% bracket by 3,500). Deduct 10,000 → 43,900.
    // Diff = 3,500 × 22% + 6,500 × 12% = 770 + 780 = 1,550 (not 2,200).
    expect(taxSaved({ taxYear: 2026, filingStatus: 'single', agi: 70_000, newDeduction: 10_000 })).toBe(1_550);
    expect(taxSaved({ taxYear: 2025, filingStatus: 'single', agi: 70_000, newDeduction: 10_000 })).toBeNull();
  });
});

describe('phase-out rounding (Schedule 1-A: divide by $1,000, round down)', () => {
  it('only full $1,000 steps reduce the deduction', () => {
    expect(phaseOutReduction(150_000, 'single')).toBe(0);
    expect(phaseOutReduction(150_999.99, 'single')).toBe(0);
    expect(phaseOutReduction(151_000, 'single')).toBe(100);
    expect(phaseOutReduction(162_500, 'single')).toBe(1_200);
    expect(phaseOutReduction(300_999, 'mfj')).toBe(0);
    expect(phaseOutReduction(301_000, 'mfj')).toBe(100);
    expect(phaseOutReduction(160_000, 'hoh')).toBe(1_000);
  });
  it('fully phased out: single OT at $275,000, single tips at $400,000, never negative', () => {
    expect(overtimeDeduction(ot({ magi: 274_999, ttAmounts: [12_500] })).deduction).toBe(100);
    expect(overtimeDeduction(ot({ magi: 275_000, ttAmounts: [12_500] })).deduction).toBe(0);
    expect(tipsDeduction(tips({ magi: 400_000, w2Tips: 25_000 })).deduction).toBe(0);
    expect(overtimeDeduction(ot({ magi: 1_000_000, ttAmounts: [12_500] })).deduction).toBe(0);
  });
});

describe('overtime page examples', () => {
  it('Example 1: $25/h × 250 OT hours → $3,125 premium; single AGI $60,000 saves $375', () => {
    const premium = estimateOvertimePremium(25, 250);
    expect(premium).toBe(3_125);
    const r = overtimeDeduction(ot({ ttAmounts: [premium] }));
    expect(r.deduction).toBe(3_125);
    expect(r.taxSaved).toBe(375);
  });
  it('Example 2: double time still only counts 0.5 × rate → $150, not $300', () => {
    expect(estimateOvertimePremium(30, 10)).toBe(150);
  });
  it('Example 3: MFJ, TT $8,000 + $6,000, MAGI $320,000 → $12,000', () => {
    const r = overtimeDeduction(ot({ filingStatus: 'mfj', magi: 320_000, ttAmounts: [8_000, 6_000] }));
    expect(r.qualified).toBe(14_000);
    expect(r.reduction).toBe(2_000);
    expect(r.deduction).toBe(12_000);
  });
  it('caps: $12,500 single/HoH/QSS, $25,000 MFJ; spouse TT ignored unless MFJ', () => {
    expect(overtimeDeduction(ot({ ttAmounts: [20_000] })).deduction).toBe(12_500);
    expect(overtimeDeduction(ot({ filingStatus: 'hoh', ttAmounts: [20_000] })).deduction).toBe(12_500);
    expect(overtimeDeduction(ot({ filingStatus: 'qss', ttAmounts: [20_000] })).deduction).toBe(12_500);
    expect(overtimeDeduction(ot({ filingStatus: 'mfj', ttAmounts: [20_000, 20_000] })).deduction).toBe(25_000);
    expect(overtimeDeduction(ot({ ttAmounts: [1_000, 9_000] })).qualified).toBe(1_000);
  });
  it('empty TT → $0, MFS → $0, no SSN → $0, FLSA-exempt → $0, year outside 2025–2028 → $0', () => {
    expect(overtimeDeduction(ot({ ttAmounts: [] })).deduction).toBe(0);
    expect(overtimeDeduction(ot({ ttAmounts: [Number.NaN] })).deduction).toBe(0);
    const mfs = overtimeDeduction(ot({ filingStatus: 'mfs', ttAmounts: [5_000] }));
    expect(mfs.eligible).toBe(false);
    expect(mfs.deduction).toBe(0);
    expect(mfs.reason).toMatch(/joint/);
    expect(overtimeDeduction(ot({ validSsn: false, ttAmounts: [5_000] })).deduction).toBe(0);
    expect(overtimeDeduction(ot({ flsaNonExempt: false, ttAmounts: [5_000] })).deduction).toBe(0);
    expect(overtimeDeduction(ot({ taxYear: 2029, ttAmounts: [5_000] })).deduction).toBe(0);
    expect(overtimeDeduction(ot({ taxYear: 2024, ttAmounts: [5_000] })).deduction).toBe(0);
  });
  it('2025 gives the deduction but no tax-saved estimate (no verified 2025 table wired)', () => {
    const r = overtimeDeduction(ot({ taxYear: 2025, ttAmounts: [3_000] }));
    expect(r.deduction).toBe(3_000);
    expect(r.taxSaved).toBeNull();
  });
});

describe('tips page examples', () => {
  it('Example 1: W-2 server (TTOC 102), TP $18,000, single AGI $38,000 → saves $1,990', () => {
    const r = tipsDeduction(tips({ w2Tips: 18_000 }));
    expect(r.deduction).toBe(18_000);
    expect(r.taxSaved).toBe(1_990);
  });
  it('Example 2: 1099-K tips $6,000 limited to net profit $4,500', () => {
    const r = tipsDeduction(tips({ occupationCode: '804', selfEmployedTips: 6_000, selfEmployedNetProfit: 4_500, magi: 40_000 }));
    expect(r.deduction).toBe(4_500);
    expect(r.notes.join(' ')).toMatch(/net profit/);
    expect(tipsDeduction(tips({ selfEmployedTips: 6_000, selfEmployedNetProfit: -100 })).deduction).toBe(0);
  });
  it('Example 3: single MAGI $162,500, tips $30,000 → $25,000 − $1,200 = $23,800', () => {
    expect(tipsDeduction(tips({ magi: 162_500, w2Tips: 30_000 })).deduction).toBe(23_800);
  });
  it('Example 4 / service charges: non-voluntary amounts → $0', () => {
    expect(tipsDeduction(tips({ w2Tips: 5_000, voluntaryTips: false })).deduction).toBe(0);
  });
  it('$25,000 cap is per return, NOT doubled for MFJ', () => {
    expect(tipsDeduction(tips({ filingStatus: 'mfj', w2Tips: 60_000, magi: 100_000 })).deduction).toBe(25_000);
    expect(tipsDeduction(tips({ filingStatus: 'mfj', w2Tips: 25_000, magi: 350_500 })).deduction).toBe(20_000);
  });
  it('box 14b code 000 or no occupation → not qualified; MFS → $0', () => {
    expect(tipsDeduction(tips({ occupationCode: '000', w2Tips: 9_000 })).deduction).toBe(0);
    expect(tipsDeduction(tips({ occupationCode: '', w2Tips: 9_000 })).deduction).toBe(0);
    expect(tipsDeduction(tips({ filingStatus: 'mfs', w2Tips: 9_000 })).deduction).toBe(0);
  });
});
