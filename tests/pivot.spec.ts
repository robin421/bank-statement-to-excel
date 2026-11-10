import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { overtimeDeduction, tipsDeduction } from '../src/lib/tax/rules';
import { PIVOT_REDIRECTS, PIVOT_SPLATS, PIVOT_TARGET } from '../src/data/pivot-redirects.mjs';

/**
 * 2026-11-10 pivot: the bank-statement converter pages were retired and every
 * old URL must 301 to a calculator, with and without the trailing slash.
 */
describe('retired converter URLs', () => {
  const redirects = fs.readFileSync(path.resolve('public/_redirects'), 'utf8').split('\n');
  const rule = (from: string) => redirects.find((line) => line.split(/\s+/)[0] === from);

  it('301s every old URL, with and without the trailing slash', () => {
    for (const [from, to] of Object.entries(PIVOT_REDIRECTS)) {
      expect(rule(from), from).toBe(`${from} ${to} 301`);
      expect(rule(`${from}/`), `${from}/`).toBe(`${from}/ ${to} 301`);
    }
    for (const [from, to] of Object.entries(PIVOT_SPLATS)) expect(rule(from), from).toBe(`${from} ${to} 301`);
  });

  it('targets a page the site still builds', () => {
    expect(fs.existsSync(path.resolve(`src/pages${PIVOT_TARGET.replace(/\/$/, '')}.astro`))).toBe(true);
  });

  it('no longer has a page source for any retired URL, and the homepage keeps its URL', () => {
    for (const from of Object.keys(PIVOT_REDIRECTS)) {
      const base = path.resolve(`src/pages${from}`);
      for (const candidate of [`${base}.astro`, `${base}.md`, path.join(base, 'index.astro')])
        expect(fs.existsSync(candidate), candidate).toBe(false);
    }
    expect(Object.keys(PIVOT_REDIRECTS)).not.toContain('/');
    expect(fs.existsSync(path.resolve('src/pages/index.astro'))).toBe(true);
  });
});

/** The worked examples on /schedule-1-a-guide/ must agree with the calculators. */
describe('Schedule 1-A guide worked examples', () => {
  it('example 1: single server, tips $9,000 → line 15; TT $2,400 → line 27', () => {
    const t = tipsDeduction({ taxYear: 2026, filingStatus: 'single', validSsn: true, voluntaryTips: true, magi: 62_000, occupationCode: '102', w2Tips: 9_000, selfEmployedTips: 0 });
    const o = overtimeDeduction({ taxYear: 2026, filingStatus: 'single', validSsn: true, flsaNonExempt: true, magi: 62_000, ttAmounts: [2_400] });
    expect(t.deduction).toBe(9_000);
    expect(o.deduction).toBe(2_400);
    expect(t.deduction + o.deduction).toBe(11_400);
  });

  it('example 2: MFJ, TT $9,000 + $5,000, MAGI $318,500 → $1,800 off → $12,200', () => {
    const o = overtimeDeduction({ taxYear: 2026, filingStatus: 'mfj', validSsn: true, flsaNonExempt: true, magi: 318_500, ttAmounts: [9_000, 5_000] });
    expect(o.capped).toBe(14_000);
    expect(o.reduction).toBe(1_800);
    expect(o.deduction).toBe(12_200);
  });

  it('example 3: 1099-K tips $3,000 under a $4,830 net-income limit → $3,000; $2,000 limit → $2,000', () => {
    const base = { taxYear: 2026, filingStatus: 'single' as const, validSsn: true, voluntaryTips: true, magi: 40_000, occupationCode: '804', w2Tips: 0, selfEmployedTips: 3_000 };
    expect(tipsDeduction({ ...base, selfEmployedNetProfit: 4_830 }).deduction).toBe(3_000);
    expect(tipsDeduction({ ...base, selfEmployedNetProfit: 2_000 }).deduction).toBe(2_000);
  });
});
