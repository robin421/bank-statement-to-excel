/**
 * Locale definitions.
 *
 * Two different things are modelled here, and conflating them is the mistake
 * that makes localised tools useless:
 *
 *  1. UI language — what the interface says. "Deutsch", "Español".
 *  2. Export locale — how numbers, dates and CSV separators are written.
 *
 * A German user needs a German interface, but they need `-1234,56` in the
 * spreadsheet and a semicolon-delimited CSV, because German Excel treats the
 * comma as the decimal separator. A Spanish user in Mexico needs a Spanish
 * interface but US-style `1,234.56`. So the two are independent, and each UI
 * language has a sensible default export locale that the user can override.
 *
 * Indian English is the clearest example of why this matters: `en-IN` is
 * English, but money is grouped in lakhs and crores (12,34,567.89), not
 * thousands. A translated interface would never fix that.
 */

import type { DateFormat } from '../lib/exporters/dates';

export const LOCALE_CODES = ['en', 'es', 'de', 'fr', 'pt', 'hi'] as const;
export type LocaleCode = (typeof LOCALE_CODES)[number];

export interface LocaleDefinition {
  code: LocaleCode;
  /** BCP-47 tag for <html lang> and hreflang. */
  htmlLang: string;
  /** Name in its own language, for the switcher. */
  label: string;
  englishLabel: string;
  /** Export locale used until the user picks another. */
  defaultExportLocale: string;
  /**
   * 'native' means the copy was written for this market.
   * 'needs-review' means structural/placeholder copy that must be reviewed by a
   * native speaker before it is worth promoting — see the README.
   */
  translationStatus: 'native' | 'needs-review';
}

export const LOCALES: Record<LocaleCode, LocaleDefinition> = {
  en: {
    code: 'en',
    htmlLang: 'en',
    label: 'English',
    englishLabel: 'English',
    defaultExportLocale: 'en-US',
    translationStatus: 'native',
  },
  es: {
    code: 'es',
    htmlLang: 'es',
    label: 'Español',
    englishLabel: 'Spanish',
    defaultExportLocale: 'es-ES',
    translationStatus: 'needs-review',
  },
  de: {
    code: 'de',
    htmlLang: 'de',
    label: 'Deutsch',
    englishLabel: 'German',
    defaultExportLocale: 'de-DE',
    translationStatus: 'needs-review',
  },
  fr: {
    code: 'fr',
    htmlLang: 'fr',
    label: 'Français',
    englishLabel: 'French',
    defaultExportLocale: 'fr-FR',
    translationStatus: 'needs-review',
  },
  pt: {
    code: 'pt',
    htmlLang: 'pt',
    label: 'Português',
    englishLabel: 'Portuguese',
    defaultExportLocale: 'pt-BR',
    translationStatus: 'needs-review',
  },
  hi: {
    code: 'hi',
    htmlLang: 'hi',
    label: 'हिन्दी',
    englishLabel: 'Hindi',
    defaultExportLocale: 'hi-IN',
    translationStatus: 'needs-review',
  },
};

export const DEFAULT_LOCALE: LocaleCode = 'en';

/** The non-default locales, i.e. those that live under a URL prefix. */
export const TRANSLATED_LOCALES = LOCALE_CODES.filter((code) => code !== DEFAULT_LOCALE);

/* ------------------------------------------------------------------ exports */

export type DecimalSeparator = '.' | ',';
export type CsvDelimiter = ',' | ';' | '\t';
export type DigitGrouping = 'western' | 'indian';

export interface ExportLocale {
  /** BCP-47 code, e.g. de-DE. */
  code: string;
  /** Language this format belongs to, for grouping in the picker. */
  language: LocaleCode;
  label: string;
  /** Character used as the decimal point. */
  decimal: DecimalSeparator;
  /** Thousands separator — used for on-screen preview only, never in exported data. */
  thousands: string;
  /** 'indian' groups as 12,34,567.89 (lakh/crore); 'western' as 1,234,567.89. */
  grouping: DigitGrouping;
  /** Separator a CSV must use so the local Excel opens it in columns. */
  csvDelimiter: CsvDelimiter;
  dateFormat: DateFormat;
}

/**
 * Export formats, keyed by BCP-47 code.
 *
 * Only the fields that actually differ between markets are listed as separate
 * entries. Note that a decimal comma forces a semicolon delimiter: a
 * comma-delimited file with comma decimals cannot be parsed by the Excel builds
 * those users are running.
 */
export const EXPORT_LOCALES: Record<string, ExportLocale> = {
  'en-US': { code: 'en-US', language: 'en', label: 'United States — 1,234.56 · MM/DD/YYYY', decimal: '.', thousands: ',', grouping: 'western', csvDelimiter: ',', dateFormat: 'MM/DD/YYYY' },
  'en-GB': { code: 'en-GB', language: 'en', label: 'United Kingdom — 1,234.56 · DD/MM/YYYY', decimal: '.', thousands: ',', grouping: 'western', csvDelimiter: ',', dateFormat: 'DD/MM/YYYY' },
  'en-AU': { code: 'en-AU', language: 'en', label: 'Australia — 1,234.56 · DD/MM/YYYY', decimal: '.', thousands: ',', grouping: 'western', csvDelimiter: ',', dateFormat: 'DD/MM/YYYY' },
  'en-CA': { code: 'en-CA', language: 'en', label: 'Canada (English) — 1,234.56 · YYYY-MM-DD', decimal: '.', thousands: ',', grouping: 'western', csvDelimiter: ',', dateFormat: 'YYYY-MM-DD' },
  'en-IN': { code: 'en-IN', language: 'en', label: 'India (English) — 12,34,567.89 · DD/MM/YYYY', decimal: '.', thousands: ',', grouping: 'indian', csvDelimiter: ',', dateFormat: 'DD/MM/YYYY' },

  'es-ES': { code: 'es-ES', language: 'es', label: 'España — 1.234,56 · DD/MM/YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },
  'es-MX': { code: 'es-MX', language: 'es', label: 'México — 1,234.56 · DD/MM/YYYY', decimal: '.', thousands: ',', grouping: 'western', csvDelimiter: ',', dateFormat: 'DD/MM/YYYY' },
  'es-AR': { code: 'es-AR', language: 'es', label: 'Argentina — 1.234,56 · DD/MM/YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },
  'es-CO': { code: 'es-CO', language: 'es', label: 'Colombia — 1.234,56 · DD/MM/YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },

  'de-DE': { code: 'de-DE', language: 'de', label: 'Deutschland — 1.234,56 · DD.MM.YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD.MM.YYYY' },
  'de-AT': { code: 'de-AT', language: 'de', label: 'Österreich — 1.234,56 · DD.MM.YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD.MM.YYYY' },
  'de-CH': { code: 'de-CH', language: 'de', label: 'Schweiz — 1’234.56 · DD.MM.YYYY', decimal: '.', thousands: '’', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD.MM.YYYY' },

  'fr-FR': { code: 'fr-FR', language: 'fr', label: 'France — 1 234,56 · DD/MM/YYYY', decimal: ',', thousands: '\u202F', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },
  'fr-CA': { code: 'fr-CA', language: 'fr', label: 'Canada (français) — 1 234,56 · YYYY-MM-DD', decimal: ',', thousands: '\u202F', grouping: 'western', csvDelimiter: ';', dateFormat: 'YYYY-MM-DD' },

  'pt-BR': { code: 'pt-BR', language: 'pt', label: 'Brasil — 1.234,56 · DD/MM/YYYY', decimal: ',', thousands: '.', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },
  'pt-PT': { code: 'pt-PT', language: 'pt', label: 'Portugal — 1 234,56 · DD/MM/YYYY', decimal: ',', thousands: '\u202F', grouping: 'western', csvDelimiter: ';', dateFormat: 'DD/MM/YYYY' },

  'hi-IN': { code: 'hi-IN', language: 'hi', label: 'भारत — 12,34,567.89 · DD/MM/YYYY', decimal: '.', thousands: ',', grouping: 'indian', csvDelimiter: ',', dateFormat: 'DD/MM/YYYY' },
};

export const EXPORT_LOCALE_CODES = Object.keys(EXPORT_LOCALES);

export const DEFAULT_EXPORT_LOCALE = 'en-US';

export function getExportLocale(code: string | undefined): ExportLocale {
  return EXPORT_LOCALES[code ?? ''] ?? EXPORT_LOCALES[DEFAULT_EXPORT_LOCALE];
}

export function defaultExportLocaleFor(locale: LocaleCode): string {
  return LOCALES[locale].defaultExportLocale;
}

/** Export locales for one language, in declaration order — used by the picker. */
export function exportLocalesFor(language: LocaleCode): ExportLocale[] {
  return EXPORT_LOCALE_CODES.map((code) => EXPORT_LOCALES[code]).filter((entry) => entry.language === language);
}

export function isLocaleCode(value: string | undefined): value is LocaleCode {
  return Boolean(value) && (LOCALE_CODES as readonly string[]).includes(value as string);
}
