import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALE_CODES, LOCALES } from '../src/i18n/locales';
import { MESSAGES } from '../src/i18n/ui';
import { useTranslations, pluralKey } from '../src/i18n';
import { HOME } from '../src/i18n/home';
import type { MessageKey } from '../src/i18n/ui';

const ENGLISH = MESSAGES[DEFAULT_LOCALE];
const KEYS = Object.keys(ENGLISH) as MessageKey[];
const TRANSLATED = LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE);

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('ui dictionaries', () => {
  it('translates every key in every language', () => {
    for (const code of TRANSLATED) {
      const dictionary = MESSAGES[code];
      for (const key of KEYS) {
        expect(dictionary[key], `${code} is missing "${key}"`).toBeTruthy();
        expect(dictionary[key].trim().length, `${code}.${key} is blank`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the same placeholders as English', () => {
    // A dropped {matched} renders a literal "{matched}" in the badge, which the
    // type system cannot catch because both are just strings.
    for (const code of TRANSLATED) {
      for (const key of KEYS) {
        expect(placeholders(MESSAGES[code][key]), `${code}.${key}`).toEqual(placeholders(ENGLISH[key]));
      }
    }
  });

  it('does not leave English text sitting in a translated dictionary', () => {
    // A handful of strings are legitimately identical across languages (CSV,
    // percentage signs), so this checks for wholesale copy-paste instead.
    for (const code of TRANSLATED) {
      const identical = KEYS.filter((key) => MESSAGES[code][key] === ENGLISH[key] && ENGLISH[key].length > 25);
      expect(identical, `${code} looks untranslated for: ${identical.join(', ')}`).toHaveLength(0);
    }
  });

  it('keeps the dictionary key set stable', () => {
    for (const code of LOCALE_CODES) {
      expect(Object.keys(MESSAGES[code]).sort()).toEqual([...KEYS].sort());
    }
  });
});

describe('translator', () => {
  it('interpolates named parameters', () => {
    const t = useTranslations('de');
    expect(t('badge.reconcile', { matched: 42, checked: 42 })).toBe('42/42 Zeilen stimmen überein');
    expect(t('badge.transactions.other', { count: 12 })).toContain('12');
  });

  it('leaves an unknown placeholder visible rather than printing undefined', () => {
    const t = useTranslations('de');
    expect(t('badge.reconcile', { matched: 1 })).toBe('1/{checked} Zeilen stimmen überein');
  });

  it('picks singular and plural forms', () => {
    const t = useTranslations('en');
    expect(t(pluralKey('badge.transactions', 1), { count: 1 })).toBe('1 transaction');
    expect(t(pluralKey('badge.transactions', 0), { count: 0 })).toBe('0 transactions');
    expect(t(pluralKey('meta.pages', 3), { count: 3 })).toBe('3 pages');
  });

  it('falls back to English for an unknown locale rather than throwing', () => {
    const t = useTranslations('xx-XX' as never);
    expect(t('dropzone.button')).toBe(ENGLISH['dropzone.button']);
  });
});

describe('localized homepage content', () => {
  it('exists for every non-default locale', () => {
    for (const code of TRANSLATED) {
      const content = HOME[code];
      expect(content, `no homepage content for ${code}`).toBeDefined();
      expect(content!.h1.length).toBeGreaterThan(5);
      expect(content!.description.length).toBeGreaterThan(60);
      expect(content!.faqs.length).toBeGreaterThanOrEqual(4);
      expect(content!.banks.length).toBeGreaterThanOrEqual(5);
      expect(content!.formatFacts.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('names banks from the market it targets rather than translating the English list', () => {
    // Localised pages earn their place by being locally specific. If a locale's
    // bank list were just a translation, it would be thin content.
    expect(HOME.de!.banks).toContain('Sparkasse');
    expect(HOME.es!.banks).toContain('CaixaBank');
    expect(HOME.fr!.banks).toContain('BNP Paribas');
    expect(HOME.pt!.banks).toContain('Nubank');
    expect(HOME.hi!.banks).toContain('HDFC Bank');
  });

  it('declares every translated locale as needing native review', () => {
    for (const code of TRANSLATED) {
      expect(LOCALES[code].translationStatus, `${code} should be flagged`).toBe('needs-review');
    }
    expect(LOCALES[DEFAULT_LOCALE].translationStatus).toBe('native');
  });

  it('gives every decimal-comma market a semicolon CSV hint in its own copy', () => {
    for (const code of ['de', 'es', 'fr', 'pt'] as const) {
      const facts = HOME[code]!.formatFacts.map((fact) => `${fact.term} ${fact.detail}`).join(' ');
      expect(facts.toLowerCase(), `${code} should mention its CSV separator`).toMatch(/csv/);
    }
  });
});
