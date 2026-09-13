import { describe, expect, it } from 'vitest';
import { looksLikeOfx, parseOfx, parseOfxDate } from '../src/lib/ofx/parse';
import { buildExport, rowsForPreset } from '../src/lib/exporters';

/** OFX 1.x flavour: unclosed tags, CRLF, the shape most banks emit. */
const OFX_V1 = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>121000248
<ACCTID>0000123456789
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20250101000000
<DTEND>20250131000000
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20250104000000
<TRNAMT>317.92
<FITID>2025010400001
<NAME>ACME PAYROLL DEPOSIT
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20250106000000
<TRNAMT>-806.84
<FITID>2025010600002
<NAME>INSURANCE PREMIUM AUTO
<MEMO>ANNUAL POLICY
</STMTTRN>
<STMTTRN>
<TRNTYPE>CHECK
<DTPOSTED>20250109000000
<TRNAMT>-88.50
<FITID>2025010900003
<CHECKNUM>1042
<NAME>CHECK #1042
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4243.13
<DTASOF>20250131000000
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

/** OFX 2.x flavour: proper XML with closing tags. */
const OFX_V2 = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR</CURDEF>
<BANKACCTFROM><BANKID>ABNANL2A</BANKID><ACCTID>NL91ABNA0417164300</ACCTID></BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20250201000000</DTSTART><DTEND>20250228000000</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20250203000000</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>A1</FITID><NAME>Energy &amp; Gas B.V.</NAME></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20250205000000</DTPOSTED><TRNAMT>2500.00</TRNAMT><FITID>A2</FITID><NAME>Client payment</NAME><MEMO>Invoice 2025-014</MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2380.00</BALAMT><DTASOF>20250228000000</DTASOF></LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('ofx detection', () => {
  it('detects OFX by content, not file name', () => {
    expect(looksLikeOfx(new TextEncoder().encode(OFX_V1))).toBe(true);
    expect(looksLikeOfx(new TextEncoder().encode('%PDF-1.7\n<OFX>'))).toBe(true);
    expect(looksLikeOfx(new TextEncoder().encode('%PDF-1.7\nstream'))).toBe(false);
  });

  it('parses OFX date-time forms', () => {
    expect(parseOfxDate('20250104000000')).toEqual({ iso: '2025-01-04', time: '00:00' });
    expect(parseOfxDate('20250104123045.000[-5:EST]')).toEqual({ iso: '2025-01-04', time: '12:30' });
    expect(parseOfxDate(null)).toEqual({ iso: null, time: null });
  });
});

describe('ofx parsing', () => {
  it('reads transactions, signs and dates from OFX 1.x', () => {
    const result = parseOfx(OFX_V1, 'chase.ofx');
    expect(result.transactions).toHaveLength(3);
    expect(result.meta.source).toBe('ofx');
    expect(result.transactions[0]).toMatchObject({ date: '2025-01-04', amount: 317.92, credit: 317.92, debit: null });
    expect(result.transactions[1]).toMatchObject({ date: '2025-01-06', amount: -806.84, debit: 806.84, credit: null });
    expect(result.transactions[2].description).toContain('Check 1042');
  });

  it('derives a running balance from the ledger balance, so rows reconcile', () => {
    const result = parseOfx(OFX_V1);
    expect(result.transactions.map((transaction) => transaction.balance)).toEqual([5138.47, 4331.63, 4243.13]);
    expect(result.reconciliation.mismatches).toHaveLength(0);
    expect(result.reconciliation.passRate).toBe(1);
  });

  it('handles the XML flavour and decodes entities', () => {
    const result = parseOfx(OFX_V2);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].description).toBe('Energy & Gas B.V.');
    expect(result.transactions[1].description).toContain('Invoice 2025-014');
    expect(result.meta.currency).toBe('EUR');
  });

  it('exports OFX rows through the same presets as PDF rows', async () => {
    const result = parseOfx(OFX_V1);
    const rows = rowsForPreset(result, { preset: 'quickbooks', dateFormat: 'MM/DD/YYYY' });
    expect(rows[1]).toEqual(['01/04/2025', 'ACME PAYROLL DEPOSIT', '317.92']);
    expect(rows[2][2]).toBe('-806.84');

    const artifact = await buildExport(result, { preset: 'xlsx', sourceName: 'chase.ofx' });
    expect(artifact.fileName).toBe('chase-transactions.xlsx');
    expect(artifact.bytes?.byteLength).toBeGreaterThan(1000);
  });

  it('does not crash on an OFX file with no transactions', () => {
    const result = parseOfx('<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
    expect(result.transactions).toHaveLength(0);
    expect(result.quality.status).toBe('low_confidence');
    expect(result.warnings.join(' ')).toMatch(/No transactions/i);
  });
});
