---
layout: ../../layouts/Article.astro
published: "2025-02-18"
readingTime: 7 min read
title: "Excel from a PDF Bank Statement: Why It Usually Goes Wrong"
description: Why converting a PDF bank statement into Excel produces one long column, what a PDF table actually is, and the specific tricks needed to rebuild statement rows and columns correctly.
---

If you have tried to get a bank statement out of a PDF and into Excel, you have probably seen one of two results: every
line crammed into a single column, or a column for every word. Neither is a bug in the converter you used. It is a
consequence of what a PDF is.

## A PDF does not contain a table

A PDF contains drawing instructions. Roughly: "place these glyphs at these coordinates, in this font". There is a table
visible on the page, but the file has no idea a table exists. Nothing in it says "this is a row" or "these values belong
to a column".

So any tool that turns a PDF into a spreadsheet is *inferring* structure that is not there. Generic converters infer it
from whitespace: if there is a wide gap, they guess a column boundary; if there is a line break, they guess a new row.
That heuristic works for a prose document and falls apart on financial tables, for four specific reasons.

### 1. Money is right-aligned, so column edges move

On a statement, `806.84` and `15.00` end at the same x position but start at different ones. A whitespace-based converter
sees a gap in a different place on nearly every row, so the "columns" it finds drift, and values land in the wrong place —
or the converter gives up and emits one column.

### 2. Descriptions wrap onto a second line

A merchant name often continues on the line below, with no date and no amount:

```
01/09/2025   POS PURCHASE
             TERMINAL 0091 SEATTLE WA       88.50    4243.13
```

Treated literally, that is two rows: one with a date and no amount, and one with an amount and no date. Neither is a
transaction.

### 3. Headers repeat in the middle of the data

Every page reprints `DATE DESCRIPTION AMOUNT BALANCE`. On a three-page statement that becomes three rows in the middle of
your transaction list — and if the numbers happen to look plausible, nobody notices.

### 4. The sign is carried by the column, not the number

Statements with separate "paid out" and "paid in" columns print both as positive numbers. `88.50` under *paid out* is a
payment; `88.50` under *paid in* is a deposit. Flatten them into one `Amount` column and the direction is lost.

## What actually works

Rebuilding a statement needs the same information a human uses when reading it — position and alignment:

- **Rows from baselines.** Group text that shares a vertical position, with a tolerance that scales with the font size.
- **Columns from the numbers.** Amounts are right-aligned, so their *right edges* cluster tightly even when the values
  differ in width. That gives exact boundaries for the columns that must not be wrong.
- **Continuation lines folded in.** A line with no date that sits between two dated rows belongs to the row above it.
- **Page furniture dropped.** Lines that repeat on most pages are not data.
- **Signs decided by arithmetic, not by position.** This is the important one, and it is what separates a converter that
  guesses from one that knows.

## The balance column is the answer key

Bank statements are self-checking documents. Every row prints a running balance, so:

```
previous balance + this row's amount = this row's balance
```

That single invariant does three jobs at once:

1. **It identifies the balance column.** Try each plausible reading of the numeric columns and keep the one that makes
   the arithmetic work.
2. **It corrects unsigned debits.** If the amounts do not reconcile but the negated amounts do, the sign was wrong.
3. **It detects dropped rows.** A missing transaction breaks the chain at that point. The failure is localised, and the
   difference tells you what is missing.

This is why [the converter](/pdf-bank-statement-to-excel/) can report *"42/42 rows reconcile"* instead of asking you to
trust it. And it is why it can also admit failure: when the chain does not close, the rows are flagged rather than
presented as fact.

## Getting real dates and numbers, not text

Even a correct extraction can arrive in Excel as text — `01/04/2025` as a string, `-806.84` as text that will not sum.
The fix is to write typed cells into the workbook rather than a CSV of strings: real dates with a date format applied,
real numbers with a two-decimal format. That is what the `.xlsx` output does, and why it is worth taking over CSV when a
person rather than a program is going to read the file.

## What to do with the result

Check three numbers before you rely on it: the count of rows, the total of the amounts, and the final balance against the
closing balance printed on the statement. If all three agree, the conversion is almost certainly complete. If they do
not, the running balance will point at the row where things went wrong.

For the practical walkthrough — including which file to download from your bank in the first place — see
[How to convert a bank statement to Excel](/blog/how-to-convert-bank-statement-to-excel/).
