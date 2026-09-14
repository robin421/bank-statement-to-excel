import { describe, expect, it } from 'vitest';
import { parseDate } from '../src/lib/parse/date';

/**
 * Month names across every market this tool serves.
 *
 * A German statement printing `01. Okt 2021` parsed to no date at all, and
 * therefore to zero transaction rows, because the month table only knew English.
 * The same class of bug is a missing or mistyped key, so this test walks all
 * twelve months in seven languages rather than sampling a couple.
 *
 * Accents matter: `März` is normalised to `marz`, `août` to `aout`, `déc` to
 * `dec`. Listing only the accented spelling leaves the ASCII form broken, and
 * vice versa.
 */

const MONTHS: Array<{ language: string; names: string[] }> = [
  {
    language: 'en',
    names: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  {
    language: 'de',
    names: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  },
  {
    language: 'de (ASCII spelled)',
    names: ['Jan', 'Feb', 'Maerz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  },
  {
    language: 'fr',
    names: ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'],
  },
  {
    language: 'es',
    names: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  },
  {
    language: 'pt',
    names: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  },
  {
    language: 'it',
    names: ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'],
  },
  {
    language: 'nl',
    names: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  },
];

describe('month names in every supported market', () => {
  for (const { language, names } of MONTHS) {
    it(`parses ${language} month names`, () => {
      names.forEach((name, index) => {
        const month = index + 1;
        const padded = String(month).padStart(2, '0');

        // Day before month, with the trailing dot German and Dutch statements use.
        const dayFirst = parseDate(`05. ${name} 2024`, 'DMY', null);
        expect(dayFirst, `${language}: "05. ${name} 2024" did not parse`).not.toBeNull();
        expect(dayFirst?.month, `${language}: "05. ${name}" resolved to the wrong month`).toBe(month);
        expect(dayFirst?.day).toBe(5);

        // Month before day.
        const monthFirst = parseDate(`${name} 05, 2024`, 'MDY', null);
        expect(monthFirst, `${language}: "${name} 05, 2024" did not parse`).not.toBeNull();
        expect(monthFirst?.month, `${language}: "${name} 05" resolved to the wrong month`).toBe(month);

        void padded;
      });
    });
  }

  it('rejects a word that is not a month rather than guessing', () => {
    expect(parseDate('05. Foo 2024', 'DMY', null)).toBeNull();
    expect(parseDate('05. Vertrag 2024', 'DMY', null)).toBeNull();
  });
});

describe('separators between day and month', () => {
  it('accepts a dot plus a space, as German statements print', () => {
    expect(parseDate('01. Okt 2021', 'DMY', null)?.iso).toBe('2021-10-01');
  });

  it('accepts a dot alone, a hyphen, and a space alone', () => {
    expect(parseDate('01.Okt.2021', 'DMY', null)?.iso).toBe('2021-10-01');
    expect(parseDate('01-Okt-2021', 'DMY', null)?.iso).toBe('2021-10-01');
    expect(parseDate('01 Okt 2021', 'DMY', null)?.iso).toBe('2021-10-01');
  });

  it('accepts a trailing separator, because Postbank stacks the year underneath', () => {
    const parsed = parseDate('23.05.', 'DMY', 2023);
    expect(parsed?.iso).toBe('2023-05-23');
  });
});
