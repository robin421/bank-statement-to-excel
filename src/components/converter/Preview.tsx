import { useMemo, useState } from 'react';
import type { StatementResult } from '../../lib/parse';
import { PRESETS, type Preset } from '../../lib/exporters';
import { DATE_FORMATS, formatDate, type DateFormat } from '../../lib/exporters/dates';
import { DEFAULT_LOCALE, pluralKey, useTranslations, type LocaleCode } from '../../i18n';
import { exportLocalesFor, getExportLocale } from '../../i18n/locales';
import { formatAmountLocale, localeSample } from '../../i18n/format';

const PREVIEW_LIMIT = 300;

interface Props {
  result: StatementResult;
  fileName: string;
  locale: LocaleCode;
  preset: Preset;
  exportLocale: string;
  dateFormat: DateFormat;
  preparing?: boolean;
  dateOrderOverride: 'auto' | 'MDY' | 'DMY';
  onPresetChange: (preset: Preset) => void;
  onExportLocaleChange: (locale: string) => void;
  onDateFormatChange: (format: DateFormat) => void;
  onDownload: (preset: Preset) => void;
  onReset: () => void;
  onDateOrderChange: (order: 'auto' | 'MDY' | 'DMY') => void;
  onRecheck: (order: 'auto' | 'MDY' | 'DMY') => void;
}

export default function Preview({
  result,
  fileName,
  locale,
  preset,
  exportLocale,
  dateFormat,
  preparing = false,
  dateOrderOverride,
  onPresetChange,
  onExportLocaleChange,
  onDateFormatChange,
  onDownload,
  onReset,
  onDateOrderChange,
  onRecheck,
}: Props) {
  const t = useTranslations(locale);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const active = getExportLocale(exportLocale);
  const localeOptions = useMemo(() => exportLocalesFor(active.language), [active.language]);

  const { reconciliation, quality, transactions } = result;
  const verified = reconciliation.checked >= 3 && reconciliation.passRate >= 0.98;
  const partial = reconciliation.checked >= 1 && !verified;

  const visible = useMemo(
    () =>
      showFlaggedOnly
        ? transactions.filter((row) => row.flags.some((flag) => flag !== 'multiline-description'))
        : transactions,
    [transactions, showFlaggedOnly],
  );
  const shown = visible.slice(0, PREVIEW_LIMIT);

  // Screen and file must agree: the preview uses the same export locale the
  // download will, so a German user sees 1.234,56 and gets 1234,56.
  const money = (value: number | null, showZero = false) =>
    formatAmountLocale(value, active, { group: true, blankZero: !showZero });

  if (!transactions.length) {
    return (
      <div className="converter__body stack" style={{ ['--stack-gap' as string]: '1rem' }}>
        <p className="note note--warn" role="alert" style={{ margin: 0 }}>
          <strong>{t('error.noRowsTitle')}</strong>{' '}
          {quality.reasons[0] ?? t('error.noRowsFallback')}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a className="btn btn--primary" href="/scanned/">
            {t('error.scannedCta')}
          </a>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            {t('error.tryAnother')}
          </button>
        </div>
      </div>
    );
  }

  // The mismatch count gets its own localized note below; don't repeat the
  // parser's English sentence above it.
  const warnings = result.warnings.filter(
    (warning) => !(reconciliation.mismatches.length > 0 && /do not reconcile against the running balance/.test(warning)),
  );
  const flaggedCount = transactions.filter((row) => row.flags.some((flag) => flag !== 'multiline-description')).length;

  return (
    <>
      <div className="converter__head">
        {verified ? (
          <span className="badge badge--ok">
            <span className="badge__dot" aria-hidden="true" />
            {t('badge.reconcile', { matched: reconciliation.matched, checked: reconciliation.checked })}
          </span>
        ) : partial ? (
          <span className="badge badge--warn">
            <span className="badge__dot" aria-hidden="true" />
            {t('badge.reconcile', { matched: reconciliation.matched, checked: reconciliation.checked })}
          </span>
        ) : (
          <span className="badge badge--neutral">
            <span className="badge__dot" aria-hidden="true" />
            {t('badge.noBalance')}
          </span>
        )}

        <span className="badge badge--neutral">
          {t(pluralKey('badge.transactions', transactions.length), { count: transactions.length })}
        </span>

        <div className="converter__meta">
          <span
            title={fileName}
            style={{ maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {fileName}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(pluralKey('meta.pages', result.meta.pages), { count: result.meta.pages })}</span>
          <button type="button" className="btn--link" onClick={onReset}>
            {t('meta.startOver')}
          </button>
        </div>
      </div>

      <div className="converter__body stack" style={{ ['--stack-gap' as string]: '0.85rem' }}>
        {warnings.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {warnings.map((warning) => (
              <li key={warning} className="note note--warn">
                {warning}
              </li>
            ))}
          </ul>
        )}

        {result.dateOrderAmbiguous && (
          <div className="card" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', alignItems: 'flex-end' }}>
              <div className="field">
                <label htmlFor="date-order">{t('dateOrder.label')}</label>
                <select
                  id="date-order"
                  className="select"
                  value={dateOrderOverride}
                  onChange={(event) => onDateOrderChange(event.target.value as 'auto' | 'MDY' | 'DMY')}
                >
                  <option value="auto">
                    {t('dateOrder.auto', { value: result.dateOrder === 'DMY' ? t('dateOrder.dmy') : t('dateOrder.mdy') })}
                  </option>
                  <option value="MDY">{t('dateOrder.mdy')}</option>
                  <option value="DMY">{t('dateOrder.dmy')}</option>
                </select>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => onRecheck(dateOrderOverride)}>
                {t('dateOrder.recheck')}
              </button>
              <p className="field__hint" style={{ margin: 0, maxWidth: '30rem' }}>
                {t('dateOrder.title')} {t('dateOrder.hint')}
              </p>
            </div>
          </div>
        )}

        {reconciliation.mismatches.length > 0 && (
          <p className="note note--warn" style={{ margin: 0 }}>
            {t(pluralKey('mismatch.warning', reconciliation.mismatches.length), {
              count: reconciliation.mismatches.length,
            })}{' '}
            {t('mismatch.warningSuffix')}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <p className="small muted" style={{ margin: 0 }}>
            {t('meta.showingOf', { shown: shown.length, total: visible.length })}
            {visible.length > PREVIEW_LIMIT ? t('meta.allInDownload') : ''}
          </p>
          {flaggedCount > 0 && (
            <label className="small" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="checkbox" checked={showFlaggedOnly} onChange={(event) => setShowFlaggedOnly(event.target.checked)} />
              {t('meta.onlyFlagged')}
            </label>
          )}
        </div>

        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">{t('table.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('table.date')}</th>
                <th scope="col">{t('table.description')}</th>
                <th scope="col" className="num">
                  {t('table.debit')}
                </th>
                <th scope="col" className="num">
                  {t('table.credit')}
                </th>
                <th scope="col" className="num">
                  {t('table.amount')}
                </th>
                <th scope="col" className="num">
                  {t('table.balance')}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const flagged = row.flags.some((flag) => flag !== 'multiline-description');
                return (
                  <tr key={`${row.index}-${row.rowIndex}`} className={flagged ? 'row--flagged' : undefined}>
                    <td className="num">{formatDate(row.date, dateFormat) || row.dateRaw}</td>
                    <td className="desc-cell">
                      {row.description || <span className="muted">—</span>}
                      {flagged && (
                        <>
                          {' '}
                          <span className="badge badge--warn" title={row.flags.join(', ')}>
                            {t('badge.check')}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="num">{money(row.debit)}</td>
                    <td className="num">{money(row.credit)}</td>
                    <td className="num">
                      <span className={row.amount < 0 ? 'neg' : undefined}>{money(row.amount)}</span>
                    </td>
                    <td className="num">{money(row.balance, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="download-bar">
        <div className="field">
          <label htmlFor="preset">{t('download.format')}</label>
          <select id="preset" className="select" value={preset} onChange={(event) => onPresetChange(event.target.value as Preset)}>
            {Object.values(PRESETS).map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="date-format">{t('download.dateFormat')}</label>
          <select
            id="date-format"
            className="select"
            value={dateFormat}
            onChange={(event) => onDateFormatChange(event.target.value as DateFormat)}
          >
            {DATE_FORMATS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {localeOptions.length > 1 && (
          <div className="field">
            <label htmlFor="export-locale">{t('download.locale')}</label>
            <select
              id="export-locale"
              className="select"
              value={exportLocale}
              onChange={(event) => onExportLocaleChange(event.target.value)}
            >
              {localeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="download-bar__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => onDownload(preset)} disabled={preparing}>
            {preparing ? t('download.preparing') : t('download.download', { format: PRESETS[preset].shortLabel })}
          </button>
          {preset !== 'csv' && (
            <button type="button" className="btn btn--ghost" onClick={() => onDownload('csv')} disabled={preparing}>
              {t('download.alsoCsv')}
            </button>
          )}
        </div>
      </div>

      <div className="privacy-strip">
        <span>{t('download.localeHint', { locale: active.label, sample: localeSample(active) })}</span>
        <span>
          {PRESETS[preset].description}
          {active.csvDelimiter === ';' && preset !== 'xlsx' ? ' · ;' : ''}
        </span>
      </div>
    </>
  );
}
