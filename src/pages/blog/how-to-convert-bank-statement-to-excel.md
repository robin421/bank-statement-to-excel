---
layout: ../../layouts/Article.astro
published: "2025-02-18"
readingTime: 8 min read
title: How to Convert a Bank Statement to Excel (Without Retyping It)
description: A practical walkthrough of converting a bank statement PDF into Excel or CSV — which file to download from your bank, how to check the result, and what to do when the numbers do not add up.
---

Retyping a bank statement into a spreadsheet is one of those tasks that feels unavoidable until you realise it is not.
Here is the whole process, including the part most guides skip: how to tell whether the file you produced is actually
correct.

## Step 1: Get the right file from your bank

This is where most of the time is won or lost. Banks will give you the same statement in several shapes, and they are
not equally good:

1. **OFX or QFX** — if your bank offers this, take it. It is structured data, so nothing has to be guessed. [The
   converter reads it](/ofx-qfx-to-csv) and the dates cannot be misread.
2. **CSV export** — usually fine, but bank-made CSVs vary between exports in ways that trip up automated tools.
3. **The PDF download** — the right choice when there is no data export, and what most people have. Make sure you take
   the *download*, not a copy of what the browser is showing you; the in-browser viewer is sometimes an image.
4. **A printout scanned or photographed** — the worst option, and the only one that genuinely needs OCR. Avoiding it is
   usually a matter of finding the download button.

Quick way to check which one you have: open the PDF and try to highlight a single word in the middle of a transaction
line. If the words select individually, it has a text layer and [the converter](/)
will read it exactly. If nothing selects, it is an image — see [scanned statements](/scanned).

## Step 2: Convert it

Drop the file into the converter on the [homepage](/). Everything happens on your device: the PDF is never uploaded,
which is why the tool works even if you disconnect after the page has loaded.

You get a preview before you download anything, and that preview is the point. Read it.

## Step 3: Check the result properly

Here is the check almost every guide leaves out, and the one that actually catches errors.

**Bank statements are self-checking.** Every row carries a running balance. That means:

> previous balance + this row's amount = this row's balance

If that holds all the way down the statement, the rows were read correctly. If it fails somewhere, something is wrong at
that point — and the failure localises the error instead of leaving you to hunt for it.

So do three things:

- **Compare the row count.** If your statement runs from the 1st to the 31st and you have 47 rows, you should be able to
  count 47 lines on the statement.
- **Compare the closing balance.** The last balance in your spreadsheet should equal the closing balance printed on the
  statement. This is the single most valuable check, because a dropped or duplicated transaction cannot survive it.
- **Add up the amounts.** Sum the Amount column and confirm that the opening balance plus that sum equals the closing
  balance. Two independent checks on the same arithmetic.

The converter does all of this for you and reports it in the reconcile badge on the preview and on the Summary sheet of
the workbook. But it is worth knowing why the check works, because it is the same check you would apply to any conversion
— including one done by an OCR service or by a person.

## Step 4: Get the format your next step needs

- **Excel workbook** — for reading, sorting, or sending to an accountant. Dates arrive as real dates and amounts as real
  numbers, so you can sum and pivot immediately.
- **CSV** — for an importer, a script, or a database. [Details on delimiters and encodings here](/bank-statement-to-csv).
- **QuickBooks Online** — [the three-column shape it requires](/quickbooks-csv).
- **Xero** — [the `*Date`/`*Amount` header set](/xero-csv), or import OFX directly if your bank provides it.

## When the numbers do not add up

Three causes account for almost every failure, and each has a fix:

**The date order is wrong.** If your statement contains no day above the 12th, nothing in it proves whether `03/04/2025`
is 3 April or 4 March. The converter says so and offers a switch. Flip it, re-check, and look at whether the dates now
run in order.

**The amount was on the next line.** Some banks print the merchant on one line and the amount beneath it. Those rows get
a flag rather than a wrong value.

**A debit was printed unsigned.** Statements where withdrawals sit in their own column often show them as positive
numbers. If the sign is wrong, the running balance stops adding up — which is exactly how the converter detects it and
corrects it.

## A note on accuracy

The output is a conversion of what your statement says, not an audit of it. Spot-check anything you are filing,
reconciling or lending against, and keep the original PDF. The workbook's Raw sheet keeps the source text line for every
row, so any figure can always be traced back to the document it came from.
