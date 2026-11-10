export const TAX_UPDATED = '2026-11-10';

export const PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.shiftcalendar.fouronfouroff&utm_source=wattflow&utm_medium=web&utm_campaign=no_tax_on_overtime';

export interface Source { label: string; url: string }

export const SRC = {
  fs202503: { label: 'IRS FS-2025-03 — One, Big, Beautiful Bill Act: tax deductions for working Americans and seniors', url: 'https://www.irs.gov/newsroom/one-big-beautiful-bill-act-tax-deductions-for-working-americans-and-seniors' },
  s1a: { label: 'IRS — Schedule 1-A (Form 1040)', url: 'https://www.irs.gov/pub/irs-pdf/f1040s1a.pdf' },
  fs202613: { label: 'IRS FS-2026-13 — Questions and answers about the deduction for qualified overtime compensation (Aug. 2026)', url: 'https://www.irs.gov/pub/taxpros/fs-2026-13.pdf' },
  otQa: { label: 'IRS — Questions and answers about the new deduction for qualified overtime compensation', url: 'https://www.irs.gov/newsroom/questions-and-answers-about-the-new-deduction-for-qualified-overtime-compensation' },
  n2569: { label: 'IRS Notice 2025-69 — qualified tips and qualified overtime compensation', url: 'https://www.irs.gov/pub/irs-drop/n-25-69.pdf' },
  iw2: { label: 'IRS — General Instructions for Forms W-2 and W-3 (2026)', url: 'https://www.irs.gov/instructions/iw2w3' },
  fw2: { label: 'IRS — 2026 Form W-2 (box 12 codes TP and TT, box 14b)', url: 'https://www.irs.gov/pub/irs-pdf/fw2.pdf' },
  rp2532: { label: 'IRS Rev. Proc. 2025-32 — 2026 tax rate tables and standard deduction', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf' },
  ttoc: { label: 'IRS — Occupations that customarily and regularly received tips (IRS.gov/TippedOccupations)', url: 'https://www.irs.gov/forms-pubs/occupations-that-customarily-and-regularly-received-tips-on-or-before-dec-31-2024' },
  finalRegs: { label: 'IRS — Final regulations listing tipped occupations and defining qualified tips', url: 'https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-listing-occupations-where-workers-customarily-and-regularly-receive-tips-under-the-one-big-beautiful-bill' },
  fedReg: { label: 'Federal Register, 2026-04-13 — Occupations that customarily and regularly received tips; definition of qualified tips', url: 'https://www.federalregister.gov/documents/2026/04/13/2026-07104/occupations-that-customarily-and-regularly-received-tips-definition-of-qualified-tips' },
} satisfies Record<string, Source>;

export const DISCLAIMER = (date = TAX_UPDATED) =>
  `This calculator gives an estimate for federal income tax only, based on IRS guidance as of ${date}. It is not tax advice. Social Security, Medicare and state taxes are not reduced. Confirm your figures with your W-2/1099 and the Schedule 1-A instructions, or a tax professional.`;

export const OT_FAQ = [
  { q: 'Is overtime tax-free in 2026?', a: 'No. For 2025–2028 you can deduct the FLSA-required overtime premium (usually the “half” of time-and-a-half) from federal taxable income, up to $12,500 ($25,000 joint). Social Security, Medicare and, in most cases, state income tax still apply.' },
  { q: 'How much will I save with no tax on overtime?', a: 'Your savings equal the federal tax on the deductible amount at your bracket. A worker with $3,125 of qualified premium in the 12% bracket saves about $375. Use the calculator for your numbers.' },
  { q: 'What is code TT on my 2026 W-2?', a: 'Box 12 code TT is the total qualified overtime compensation your employer paid you. From tax year 2026 it is the amount you use for the deduction; you can’t deduct overtime above what is reported there.' },
  { q: 'My W-2 doesn’t show code TT (or shows the wrong amount). What do I do?', a: 'Ask your employer for a corrected W-2 (Form W-2c). The IRS says a substitute W-2 (Form 4852) can’t be used for this deduction, and if TT is overstated you may only deduct what you were actually paid.' },
  { q: 'Does double time qualify?', a: 'Only the portion the FLSA requires. If you are paid 2× for hours over 40, only 0.5× your regular rate counts.' },
  { q: 'Does California daily overtime count?', a: 'Not by itself. Only overtime required by the federal FLSA (generally hours over 40 in a workweek) qualifies; overtime required only by state law or a union contract does not.' },
  { q: 'I’m salaried — can I take it?', a: 'Only if you are FLSA non-exempt and are paid FLSA overtime. Exempt employees’ overtime doesn’t qualify.' },
  { q: 'Can married couples filing separately claim it?', a: 'No. Married taxpayers must file jointly, and the person who earned the overtime needs a Social Security number valid for employment.' },
  { q: 'Do I need to itemize?', a: 'No. You can take it with the standard deduction. It’s claimed on Schedule 1-A, Part III.' },
  { q: 'What’s the income limit?', a: 'The deduction drops by $100 for every full $1,000 of MAGI over $150,000 ($300,000 joint).' },
];

export const TIP_FAQ = [
  { q: 'Are tips tax-free in 2026?', a: 'Not fully. You can deduct up to $25,000 of qualified tips from federal taxable income for 2025–2028. Social Security and Medicare (or self-employment tax) still apply, and state rules vary.' },
  { q: 'Does no tax on tips apply to DoorDash, Uber or Instacart?', a: 'It can. Self-employed people qualify if their occupation is on the IRS list (it includes taxi and rideshare drivers and goods delivery people) and the tips are included on a 1099-NEC, 1099-MISC or 1099-K. For self-employed workers the deduction can’t exceed the net profit of that business.' },
  { q: 'Is my job on the list?', a: 'Check the Treasury Tipped Occupation Code list at IRS.gov/TippedOccupations. More than 70 occupations across 8 groups qualify, from bartenders to water-taxi operators. The final rules added visual artists, floral designers and gas pump attendants.' },
  { q: 'Do credit-card and app tips count?', a: 'Yes. Qualified tips can be paid in cash, by card, check, gift card or payment app, as long as the customer gave them voluntarily.' },
  { q: 'Do automatic service charges count?', a: 'No, unless the customer can remove or change the charge.' },
  { q: 'What are code TP and box 14b on my 2026 W-2?', a: 'Code TP is the total cash tips you reported to your employer; box 14b is your Treasury Tipped Occupation Code. If box 14b shows only 000, those tips don’t qualify.' },
  { q: 'Is the $25,000 limit doubled for married couples?', a: 'No. It’s $25,000 per return, including joint returns. (The overtime limit is the one that doubles.)' },
  { q: 'Can I claim both tips and overtime?', a: 'Yes, if you qualify for each. They are separate parts of Schedule 1-A with separate limits.' },
  { q: 'Do I have to itemize?', a: 'No. It’s available with the standard deduction.' },
  { q: 'What if I didn’t report my cash tips to my employer?', a: 'Only tips reported on a W-2 or 1099, or that you report yourself on Form 4137, can be deducted. Keep a daily tip log.' },
  { q: 'Is there an income limit?', a: 'Yes. The deduction shrinks by $100 for every full $1,000 of MAGI above $150,000 ($300,000 joint).' },
];

export const TT_FAQ = [
  { q: 'What does code TT mean on a W-2?', a: 'Box 12 code TT is the total amount of qualified overtime compensation your employer paid you during the year — only the premium above your regular rate that the FLSA requires, such as the “half” of time-and-a-half. It is new on the 2026 Form W-2.' },
  { q: 'Is the code TT amount already excluded from box 1 wages?', a: 'No. Overtime is still wages and stays in box 1, and Social Security and Medicare tax still apply. You use the TT amount to figure the separate deduction on Schedule 1-A, Part III.' },
  { q: 'Can I deduct more overtime than code TT shows?', a: 'Not for tax years after 2025. The IRS says you may not consider any qualified overtime in excess of what is reported in box 12 code TT. If the amount is too low, ask your employer for a Form W-2c.' },
  { q: 'Can I use Form 4852 if my employer won’t correct code TT?', a: 'No. The IRS says Form 4852 does not satisfy the reporting requirement, so overtime reported only on Form 4852 can’t be used for the deduction.' },
  { q: 'What if code TT is too high?', a: 'You may only use the qualified overtime you were actually paid. If TT is overstated, deduct the actual amount, not the reported one.' },
  { q: 'Why doesn’t my 2025 W-2 have code TT?', a: 'For 2025, employers were not required to report qualified overtime separately; Notice 2025-69 lets you figure the amount yourself for that year. Code TT starts with the 2026 Form W-2.' },
];
