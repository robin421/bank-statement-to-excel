import { DEFAULT_LOCALE, LOCALE_CODES, isLocaleCode, type LocaleCode } from './locales';
import { MESSAGES, type MessageKey } from './ui';

export type TranslateParams = Record<string, string | number>;

export type Translator = (key: MessageKey, params?: TranslateParams) => string;

/**
 * Build a translator for one locale.
 *
 * Missing keys fall back to English rather than rendering the key name: a stray
 * English sentence on a German page is a smaller failure than `dropzone.title`
 * appearing in the UI. Because every dictionary is typed as complete, this
 * fallback should never fire in practice — the type checker catches it first.
 */
export function useTranslations(locale: LocaleCode = DEFAULT_LOCALE): Translator {
  const dictionary = MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
  const fallback = MESSAGES[DEFAULT_LOCALE];

  return (key, params) => {
    const template = dictionary[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
    );
  };
}

/**
 * Pick the singular or plural message.
 * `one` / `other` is enough for the six languages here; a language with more
 * plural categories would need the keys to be extended, not this function.
 */
export function pluralKey(base: string, count: number): MessageKey {
  const key = `${base}.${count === 1 ? 'one' : 'other'}`;
  return key as MessageKey;
}

export function resolveLocale(value: string | undefined | null): LocaleCode {
  return isLocaleCode(value ?? undefined) ? (value as LocaleCode) : DEFAULT_LOCALE;
}

export { LOCALE_CODES, DEFAULT_LOCALE, LOCALES, TRANSLATED_LOCALES, isLocaleCode, getExportLocale, defaultExportLocaleFor, exportLocalesFor, EXPORT_LOCALES } from './locales';
export type { LocaleCode, ExportLocale, LocaleDefinition } from './locales';
export { formatAmountDisplay, formatAmountLocale, formatAmountPlain, localeSample } from './format';
export { MESSAGES } from './ui';
export type { MessageKey } from './ui';
