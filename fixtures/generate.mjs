#!/usr/bin/env node
/**
 * Synthetic bank-statement fixture generator.
 *
 * Real statements are PII and must never enter the repo, so every layout the
 * parser is tested against is generated here, together with the ground truth
 * the tests compare against. Layouts are modelled on the shapes named in
 * src/data/keywords.ts; the numbers are deterministic so failures are
 * reproducible.
 *
 *   npm run fixtures
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
const PDF_DIR = path.join(here, 'pdf');
const EXPECTED_DIR = path.join(here, 'expected');

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 42;
const BODY = 9;
const LINE = 13;

const OPENING_BALANCE = 4820.55;

const MERCHANTS = [
  'ACME PAYROLL DEPOSIT',
  'WHOLE FOODS MKT #10234',
  'CITY ELECTRIC UTILITY',
  'TRANSFER TO SAVINGS',
  'AMAZON MKTPLACE PMTS',
  'CHECK #1042',
  'MOBILE DEPOSIT',
  'NORTHWIND TRADING CO',
  'RENT PAYMENT PORTAL',
  'ATM WITHDRAWAL 4821 MAIN ST',
  'INTEREST PAYMENT',
  'SERVICE FEE - MONTHLY',
  'REFUND BEST BUY #0442',
  'UPWORK ESCROW PAYOUT',
  'INSURANCE PREMIUM AUTO',
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

/** Deterministic, monotonically-dated transaction set with a valid balance chain. */
function makeTransactions(seed, count, startISO) {
  const rand = mulberry32(seed);
  const transactions = [];
  let balance = OPENING_BALANCE;
  const cursor = new Date(`${startISO}T00:00:00Z`);

  for (let index = 0; index < count; index += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1 + Math.floor(rand() * 3));
    const description = MERCHANTS[Math.floor(rand() * MERCHANTS.length)];
    const roll = rand();
    const magnitude = round2(5 + rand() * 940);
    // Keep the balance positive: the running-balance oracle is meaningless if it
    // goes negative in a way the fixture itself does not model.
    let amount = roll < 0.42 ? magnitude : -magnitude;
    if (balance + amount < 100) amount = Math.abs(amount);
    balance = round2(balance + amount);

    transactions.push({
      dateISO: cursor.toISOString().slice(0, 10),
      description: index % 5 === 3 ? `${description} REF 88213${index}` : description,
      amount,
      balance,
      secondLine: index % 7 === 2 ? 'POS DEBIT TERMINAL 0091' : null,
    });
  }

  return transactions;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const FORMATTERS = {
  'MM/DD/YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y}`;
  },
  'MM/DD/YY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${m}/${d}/${y.slice(2)}`;
  },
  'DD/MM/YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },
  'DD/MM/YY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  },
  'DD-MM-YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;
  },
  'DD.MM.YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  },
  'DD Mon YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${Number(d)} ${MONTH_ABBR[Number(m) - 1]} ${y}`;
  },
  'Mon DD, YYYY': (iso) => {
    const [y, m, d] = iso.split('-');
    return `${MONTH_ABBR[Number(m) - 1]} ${Number(d)}, ${y}`;
  },
};

const AMOUNT_FORMATTERS = {
  us: (value) => {
    const abs = Math.abs(value).toFixed(2);
    const [int, frac] = abs.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${value < 0 ? '-' : ''}${grouped}.${frac}`;
  },
  usParen: (value) => {
    const abs = Math.abs(value).toFixed(2);
    const [int, frac] = abs.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return value < 0 ? `(${grouped}.${frac})` : `${grouped}.${frac}`;
  },
  indian: (value) => {
    const abs = Math.abs(value).toFixed(2);
    const [int, frac] = abs.split('.');
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3);
    const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
    return `${value < 0 ? '-' : ''}${grouped}.${frac}`;
  },
  eu: (value) => {
    const abs = Math.abs(value).toFixed(2);
    const [int, frac] = abs.split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${value < 0 ? '-' : ''}${grouped},${frac}`;
  },
  plain: (value) => Math.abs(value).toFixed(2),
};

function sanitize(text) {
  return String(text).replace(/[^\x20-\x7E]/g, ' ');
}

async function newDoc() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

function drawText(page, font, text, x, y, size = BODY, color = rgb(0, 0, 0)) {
  page.drawText(sanitize(text), { x, y, size, font, color });
}

function drawRight(page, font, text, rightX, y, size = BODY) {
  const clean = sanitize(text);
  const width = font.widthOfTextAtSize(clean, size);
  page.drawText(clean, { x: rightX - width, y, size, font });
}

/**
 * Render a table.
 * columns: [{ key, x, width, align }] where `x` is the left edge and, for
 * right-aligned columns, `width` is used to derive the right edge.
 */
function drawTable(page, fonts, columns, records, startY, options = {}) {
  const { size = BODY, lineHeight = LINE, rows = records, header = true } = options;
  let y = startY;

  if (header) {
    for (const column of columns) {
      if (column.align === 'right') drawRight(page, fonts.bold, column.title, column.x + column.width, y, size);
      else drawText(page, fonts.bold, column.title, column.x, y, size);
    }
    y -= lineHeight * 0.5;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: rgb(0.75, 0.75, 0.75) });
    y -= lineHeight * 0.7;
  }

  for (const record of rows) {
    for (const column of columns) {
      const value = record[column.key];
      if (value === undefined || value === null) continue;
      if (column.align === 'right') drawRight(page, fonts.regular, value, column.x + column.width, y, size);
      else drawText(page, fonts.regular, value, column.x, y, size);
    }
    y -= lineHeight;
  }

  return y;
}

function writeExpected(name, transactions, extra = {}) {
  const payload = {
    name,
    openingBalance: OPENING_BALANCE,
    transactions: transactions.map((transaction) => ({
      date: transaction.dateISO,
      description: transaction.description,
      amount: transaction.amount,
      balance: transaction.balance,
    })),
    ...extra,
  };
  fs.writeFileSync(path.join(EXPECTED_DIR, `${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

function savePdf(doc, name) {
  return doc.save().then((bytes) => {
    fs.writeFileSync(path.join(PDF_DIR, `${name}.pdf`), bytes);
  });
}

const COLUMN = {
  date: { key: 'date', title: 'DATE', x: MARGIN, width: 62, align: 'left' },
  description: { key: 'description', title: 'DESCRIPTION', x: 112, width: 230, align: 'left' },
  amount: { key: 'amount', title: 'AMOUNT', x: 352, width: 78, align: 'right' },
  balance: { key: 'balance', title: 'BALANCE', x: 440, width: 88, align: 'right' },
};

const COLUMN_WIDE = {
  date: { key: 'date', title: 'DATE', x: MARGIN, width: 66, align: 'left' },
  description: { key: 'description', title: 'DESCRIPTION', x: 118, width: 200, align: 'left' },
  amount: { key: 'amount', title: 'AMOUNT', x: 330, width: 72, align: 'right' },
  balance: { key: 'balance', title: 'RUNNING BAL', x: 412, width: 116, align: 'right' },
};

const COLUMN_SPLIT = {
  date: { key: 'date', title: 'DATE', x: MARGIN, width: 60, align: 'left' },
  description: { key: 'description', title: 'DESCRIPTION', x: 106, width: 176, align: 'left' },
  debit: { key: 'debit', title: 'DEBIT', x: 288, width: 62, align: 'right' },
  credit: { key: 'credit', title: 'CREDIT', x: 356, width: 62, align: 'right' },
  balance: { key: 'balance', title: 'BALANCE', x: 424, width: 104, align: 'right' },
};

const COLUMN_INDIA = {
  date: { key: 'date', title: 'Date', x: MARGIN, width: 52, align: 'left' },
  description: { key: 'description', title: 'Narration', x: 100, width: 158, align: 'left' },
  ref: { key: 'ref', title: 'Chq./Ref.No.', x: 264, width: 58, align: 'left' },
  debit: { key: 'debit', title: 'Withdrawal Amt.', x: 328, width: 72, align: 'right' },
  credit: { key: 'credit', title: 'Deposit Amt.', x: 404, width: 66, align: 'right' },
  balance: { key: 'balance', title: 'Closing Balance', x: 474, width: 96, align: 'right' },
};

const COLUMN_UK = {
  date: { key: 'date', title: 'Date', x: MARGIN, width: 62, align: 'left' },
  description: { key: 'description', title: 'Description', x: 116, width: 184, align: 'left' },
  debit: { key: 'debit', title: 'Paid out', x: 306, width: 70, align: 'right' },
  credit: { key: 'credit', title: 'Paid in', x: 384, width: 64, align: 'right' },
  balance: { key: 'balance', title: 'Balance', x: 456, width: 114, align: 'right' },
};

function decorate(page, fonts, title, subtitle) {
  drawText(page, fonts.bold, title, MARGIN, PAGE_HEIGHT - 52, 14);
  drawText(page, fonts.regular, subtitle, MARGIN, PAGE_HEIGHT - 70, 9, rgb(0.35, 0.35, 0.35));
  drawText(page, fonts.regular, `Statement period: 01/01/2025 - 31/03/2025`, MARGIN, PAGE_HEIGHT - 86, 9, rgb(0.35, 0.35, 0.35));
  drawText(page, fonts.regular, 'Account number: ****4821', MARGIN, PAGE_HEIGHT - 100, 9, rgb(0.35, 0.35, 0.35));
}

function addFooter(page, fonts, pageNumber, pageCount) {
  drawText(page, fonts.regular, `Page ${pageNumber} of ${pageCount}`, PAGE_WIDTH / 2 - 22, 40, 8, rgb(0.45, 0.45, 0.45));
  drawText(page, fonts.regular, 'Member FDIC. Equal Housing Lender.', MARGIN, 28, 7, rgb(0.55, 0.55, 0.55));
}

/* ------------------------------------------------------------------ layouts */

async function buildSimple(name, { title, columns, format, amountFormat, seed, count, secondLines = false, startISO = '2025-01-03' }) {
  const transactions = makeTransactions(seed, count, startISO);
  const { doc, font, bold } = await newDoc();
  const fonts = { regular: font, bold };
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  decorate(page, fonts, title, 'Statement of account');

  const records = transactions.map((transaction) => ({
    date: FORMATTERS[format](transaction.dateISO),
    description: transaction.description,
    amount: AMOUNT_FORMATTERS[amountFormat](transaction.amount),
    balance: AMOUNT_FORMATTERS[amountFormat](transaction.balance),
    secondLine: secondLines ? transaction.secondLine : null,
  }));

  drawTable(page, fonts, columns, records, PAGE_HEIGHT - 130, {
    rows: records.flatMap((record) =>
      record.secondLine
        ? [record, { description: `   ${record.secondLine}` }]
        : [record],
    ),
  });
  addFooter(page, fonts, 1, 1);

  await savePdf(doc, name);
  writeExpected(name, transactions);
  return { name, transactions };
}

async function buildSplitColumns(name, { title, columns, format, amountFormat, seed, count, refPrefix = false }) {
  const transactions = makeTransactions(seed, count, '2025-01-03');
  const { doc, font, bold } = await newDoc();
  const fonts = { regular: font, bold };
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  decorate(page, fonts, title, 'Statement of account');

  const records = transactions.map((transaction, index) => ({
    date: FORMATTERS[format](transaction.dateISO),
    description: transaction.description,
    ref: refPrefix ? `S${400000 + index * 7}` : null,
    debit: transaction.amount < 0 ? AMOUNT_FORMATTERS[amountFormat](-transaction.amount) : null,
    credit: transaction.amount > 0 ? AMOUNT_FORMATTERS[amountFormat](transaction.amount) : null,
    balance: AMOUNT_FORMATTERS[amountFormat](transaction.balance),
  }));

  drawTable(page, fonts, columns, records, PAGE_HEIGHT - 130);
  addFooter(page, fonts, 1, 1);

  await savePdf(doc, name);
  writeExpected(name, transactions);
  return { name };
}

async function buildMultipage(name) {
  const transactions = makeTransactions(4242, 46, '2025-01-02');
  const { doc, font, bold } = await newDoc();
  const fonts = { regular: font, bold };
  const perPage = 17;
  const pages = Math.ceil(transactions.length / perPage);
  const columns = [COLUMN_SPLIT.date, COLUMN_SPLIT.description, COLUMN_SPLIT.debit, COLUMN_SPLIT.credit, COLUMN_SPLIT.balance];

  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    decorate(page, fonts, 'Northwind Bank', 'Business checking - continued');
    const slice = transactions.slice(index * perPage, (index + 1) * perPage);
    const records = slice.map((transaction) => ({
      date: FORMATTERS['MM/DD/YYYY'](transaction.dateISO),
      description: transaction.description,
      debit: transaction.amount < 0 ? AMOUNT_FORMATTERS.us(-transaction.amount) : null,
      credit: transaction.amount > 0 ? AMOUNT_FORMATTERS.us(transaction.amount) : null,
      balance: AMOUNT_FORMATTERS.us(transaction.balance),
    }));
    drawTable(page, fonts, columns, records, PAGE_HEIGHT - 130);
    addFooter(page, fonts, index + 1, pages);
  }

  await savePdf(doc, name);
  writeExpected(name, transactions);
  return { name };
}

/** Debit/credit columns and no running balance at all. */
async function buildNoBalance(name) {
  const transactions = makeTransactions(777, 22, '2025-02-01');
  const { doc, font, bold } = await newDoc();
  const fonts = { regular: font, bold };
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  decorate(page, fonts, 'Cedar Savings Bank', 'Transaction history');

  const columns = [
    { key: 'date', title: 'DATE', x: MARGIN, width: 64, align: 'left' },
    { key: 'description', title: 'DESCRIPTION', x: 120, width: 232, align: 'left' },
    { key: 'debit', title: 'WITHDRAWALS', x: 358, width: 80, align: 'right' },
    { key: 'credit', title: 'DEPOSITS', x: 446, width: 76, align: 'right' },
  ];

  const records = transactions.map((transaction) => ({
    date: FORMATTERS['MM/DD/YY'](transaction.dateISO),
    description: transaction.description,
    debit: transaction.amount < 0 ? AMOUNT_FORMATTERS.us(-transaction.amount) : null,
    credit: transaction.amount > 0 ? AMOUNT_FORMATTERS.us(transaction.amount) : null,
  }));

  drawTable(page, fonts, columns, records, PAGE_HEIGHT - 130);
  addFooter(page, fonts, 1, 1);

  await savePdf(doc, name);
  writeExpected(name, transactions);
  return { name };
}

/** Wells-Fargo-style: a daily-balance summary block that looks like data. */
async function buildWithSummaryBlock(name) {
  const transactions = makeTransactions(31337, 18, '2025-01-06');
  const { doc, font, bold } = await newDoc();
  const fonts = { regular: font, bold };
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  decorate(page, fonts, 'Wells Fargo', 'Everyday checking');

  const columns = [
    { key: 'date', title: 'DATE', x: MARGIN, width: 62, align: 'left' },
    { key: 'description', title: 'DESCRIPTION', x: 114, width: 214, align: 'left' },
    { key: 'amount', title: 'AMOUNT', x: 340, width: 74, align: 'right' },
    { key: 'balance', title: 'BALANCE', x: 424, width: 104, align: 'right' },
  ];

  const records = transactions.map((transaction) => ({
    date: FORMATTERS['MM/DD/YYYY'](transaction.dateISO),
    description: transaction.description,
    amount: AMOUNT_FORMATTERS.us(transaction.amount),
    balance: AMOUNT_FORMATTERS.us(transaction.balance),
  }));

  const endY = drawTable(page, fonts, columns, records.slice(0, 12), PAGE_HEIGHT - 130);

  // A summary block with a date-like "closing balance" line that must not be
  // mistaken for a transaction.
  drawText(page, fonts.bold, 'Daily Balance Summary', MARGIN, endY - 18, 10);
  drawTable(
    page,
    fonts,
    [
      { key: 'date', title: 'Date', x: MARGIN, width: 62, align: 'left' },
      { key: 'description', title: 'Description', x: 114, width: 214, align: 'left' },
      { key: 'balance', title: 'Balance', x: 424, width: 104, align: 'right' },
    ],
    [
      { date: 'Beginning balance', description: '', balance: AMOUNT_FORMATTERS.us(OPENING_BALANCE) },
      { date: 'Ending balance', description: '', balance: AMOUNT_FORMATTERS.us(transactions[11].balance) },
    ],
    endY - 40,
    { header: false },
  );
  addFooter(page, fonts, 1, 1);

  await savePdf(doc, name);
  // Only the first 12 rows are rendered as transactions.
  writeExpected(name, transactions.slice(0, 12));
  return { name };
}

/** A PDF with no text layer at all: the scanned-statement case. */
async function buildScan(name) {
  const { doc } = await newDoc();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 40, y: 40, width: PAGE_WIDTH - 80, height: PAGE_HEIGHT - 80, borderWidth: 1, borderColor: rgb(0.5, 0.5, 0.5) });
  for (let index = 0; index < 26; index += 1) {
    page.drawRectangle({ x: 60, y: PAGE_HEIGHT - 90 - index * 22, width: 380 - (index % 4) * 30, height: 8, color: rgb(0.82, 0.82, 0.82) });
  }
  await savePdf(doc, name);
  writeExpected(name, []);
  return { name };
}

/** A text layer full of garbage: scanned OCR layer, or a broken font encoding. */
async function buildBrokenText(name) {
  const { doc, font } = await newDoc();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  // Symbol-heavy alphabet, which is what a broken font encoding or a bad OCR
  // layer actually produces: plenty of extractable characters, almost no words.
  const alphabet = '!@#$%^&*()_+=[]{}|;:<>?/~`\\^0123456789';
  let y = PAGE_HEIGHT - 60;
  for (let row = 0; row < 40; row += 1) {
    let line = '';
    for (let column = 0; column < 52; column += 1) {
      line += alphabet[(row * 7 + column * 13) % alphabet.length];
    }
    drawText(page, font, line, MARGIN, y, 8);
    y -= 16;
  }
  await savePdf(doc, name);
  writeExpected(name, []);
  return { name };
}

async function main() {
  fs.mkdirSync(PDF_DIR, { recursive: true });
  fs.mkdirSync(EXPECTED_DIR, { recursive: true });

  const built = [];

  built.push(
    await buildSimple('chase-like', {
      title: 'Chase',
      columns: [COLUMN.date, COLUMN.description, COLUMN.amount, COLUMN.balance],
      format: 'MM/DD/YYYY',
      amountFormat: 'us',
      seed: 1001,
      count: 24,
    }),
  );

  built.push(
    await buildSimple('boa-like', {
      title: 'Bank of America',
      columns: [COLUMN_WIDE.date, COLUMN_WIDE.description, COLUMN_WIDE.amount, COLUMN_WIDE.balance],
      format: 'MM/DD/YYYY',
      amountFormat: 'us',
      seed: 1002,
      count: 20,
      secondLines: true,
    }),
  );

  built.push(
    await buildWithSummaryBlock('wells-fargo-like'),
  );

  built.push(
    await buildSplitColumns('hdfc-like', {
      title: 'HDFC Bank',
      columns: [COLUMN_INDIA.date, COLUMN_INDIA.description, COLUMN_INDIA.ref, COLUMN_INDIA.debit, COLUMN_INDIA.credit, COLUMN_INDIA.balance],
      format: 'DD/MM/YY',
      amountFormat: 'indian',
      seed: 1003,
      count: 21,
      refPrefix: true,
    }),
  );

  built.push(
    await buildSplitColumns('icici-like', {
      title: 'ICICI Bank',
      columns: [
        { key: 'date', title: 'Date', x: MARGIN, width: 58, align: 'left' },
        { key: 'description', title: 'Transaction Remarks', x: 106, width: 170, align: 'left' },
        { key: 'ref', title: 'Ref No.', x: 282, width: 60, align: 'left' },
        { key: 'debit', title: 'Withdrawal (INR)', x: 348, width: 66, align: 'right' },
        { key: 'credit', title: 'Deposit (INR)', x: 420, width: 60, align: 'right' },
        { key: 'balance', title: 'Balance (INR)', x: 486, width: 84, align: 'right' },
      ],
      format: 'DD-MM-YYYY',
      amountFormat: 'indian',
      seed: 1004,
      count: 19,
      refPrefix: true,
    }),
  );

  built.push(
    await buildSplitColumns('hsbc-like', {
      title: 'HSBC UK',
      columns: [COLUMN_UK.date, COLUMN_UK.description, COLUMN_UK.debit, COLUMN_UK.credit, COLUMN_UK.balance],
      format: 'DD/MM/YYYY',
      amountFormat: 'us',
      seed: 1005,
      count: 23,
    }),
  );

  built.push(
    await buildSimple('parens-negative', {
      title: 'Meridian Credit Union',
      columns: [COLUMN.date, COLUMN.description, COLUMN.amount, COLUMN.balance],
      format: 'Mon DD, YYYY',
      amountFormat: 'usParen',
      seed: 1006,
      count: 17,
    }),
  );

  built.push(
    await buildSimple('euro-decimal', {
      title: 'Nordbank AG',
      columns: [COLUMN.date, COLUMN.description, COLUMN.amount, COLUMN.balance],
      format: 'DD.MM.YYYY',
      amountFormat: 'eu',
      seed: 1007,
      count: 18,
    }),
  );

  built.push(
    await buildSimple('day-month-name', {
      title: 'Barclays',
      columns: [COLUMN.date, COLUMN.description, COLUMN.amount, COLUMN.balance],
      format: 'DD Mon YYYY',
      amountFormat: 'us',
      seed: 1008,
      count: 16,
    }),
  );

  built.push(await buildMultipage('multipage'));
  built.push(await buildNoBalance('no-balance'));
  built.push(await buildScan('scan-no-text'));
  built.push(await buildBrokenText('broken-text-layer'));

  // Optional: encrypt one fixture with pypdf so the password path is covered.
  const toEncrypt = path.join(PDF_DIR, 'chase-like.pdf');
  const encrypted = path.join(PDF_DIR, 'password-protected.pdf');
  try {
    const { spawnSync } = await import('node:child_process');
    const script = `
import sys
from pypdf import PdfReader, PdfWriter
reader = PdfReader(sys.argv[1])
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt(user_password="hunter2", owner_password="hunter2")
with open(sys.argv[2], "wb") as handle:
    writer.write(handle)
`;
    const result = spawnSync('python3', ['-c', script, toEncrypt, encrypted], { encoding: 'utf8' });
    if (result.status === 0) {
      fs.copyFileSync(path.join(EXPECTED_DIR, 'chase-like.json'), path.join(EXPECTED_DIR, 'password-protected.json'));
      built.push({ name: 'password-protected' });
      console.log('  ✓ password-protected.pdf (user password: hunter2)');
    } else {
      console.warn('  ! skipped password-protected fixture:', (result.stderr || '').trim().split('\n').pop());
    }
  } catch (error) {
    console.warn('  ! skipped password-protected fixture:', error.message);
  }

  console.log(`\nGenerated ${built.length} fixtures in fixtures/pdf and fixtures/expected:`);
  for (const entry of built) console.log(`  - ${entry.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
