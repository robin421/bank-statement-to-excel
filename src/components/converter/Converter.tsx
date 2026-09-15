import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFile, type ConvertProgress } from '../../lib/pdf/convertFile';
import { PdfNoTextLayerError, PdfPasswordRequiredError, PdfTooLargeError } from '../../lib/pdf/types';
import { buildExport, PRESETS, type Preset } from '../../lib/exporters';
import { DATE_FORMATS, type DateFormat } from '../../lib/exporters/dates';
import type { StatementResult } from '../../lib/parse';
import { DEFAULT_LOCALE, useTranslations, type LocaleCode } from '../../i18n';
import { defaultExportLocaleFor, exportLocalesFor, getExportLocale } from '../../i18n/locales';
import { track } from '../../lib/analytics/gtag';
import Preview from './Preview';

const MAX_BYTES = 60 * 1024 * 1024;

type Status = 'idle' | 'busy' | 'password' | 'ready' | 'error';

interface Props {
  /** UI language. Defaults to English. */
  locale?: LocaleCode;
  compact?: boolean;
  affiliateUrl?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Converter({ locale = DEFAULT_LOCALE, compact = false, affiliateUrl }: Props) {
  const t = useTranslations(locale);

  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [fileName, setFileName] = useState<string>('statement.pdf');
  const [error, setError] = useState<string>('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [preset, setPreset] = useState<Preset>('xlsx');
  const [exportLocale, setExportLocale] = useState<string>(() => defaultExportLocaleFor(locale));
  const [dateFormat, setDateFormat] = useState<DateFormat>(() => getExportLocale(defaultExportLocaleFor(locale)).dateFormat);
  const [dateOrderOverride, setDateOrderOverride] = useState<'auto' | 'MDY' | 'DMY'>('auto');
  const [preparing, setPreparing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

  const localeOptions = useMemo(() => exportLocalesFor(locale), [locale]);

  const progressLabel = useCallback(
    (value: ConvertProgress | null): string => {
      if (!value) return t('status.starting');
      switch (value.stage) {
        case 'reading':
          return t('status.reading');
        case 'extracting':
          return value.total ? t('status.extracting', { done: value.done ?? 0, total: value.total }) : t('status.extractingUnknown');
        case 'parsing':
          return t('status.parsing');
        default:
          return t('status.finishing');
      }
    },
    [t],
  );

  const run = useCallback(
    async (file: File, passwordAttempt?: string, order: 'auto' | 'MDY' | 'DMY' = 'auto') => {
      pendingFile.current = file;
      setStatus('busy');
      setError('');
      setPasswordError('');
      setProgress(null);
      setResult(null);

      try {
        const parsed = await convertFile(file, {
          password: passwordAttempt,
          dateOrder: order,
          onProgress: setProgress,
        });
        setFileName(file.name);
        setResult(parsed);
        setStatus('ready');
        // The funnel this site exists to measure: submitted -> parsed -> downloaded.
        // Counts, a ratio and category names. No descriptions, amounts or dates.
        track('statement_parsed', {
          pages: parsed.meta.pages,
          rows: parsed.transactions.length,
          reconcile_rate: Math.round(parsed.reconciliation.passRate * 100) / 100,
          quality: parsed.quality.status,
          source: parsed.meta.source ?? 'pdf',
        });
        // Every statement is different, so start from the export locale's own
        // date convention rather than the preset's guess.
        setDateFormat(getExportLocale(exportLocale).dateFormat);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        if (caught instanceof PdfPasswordRequiredError) {
          setStatus('password');
          setPasswordError(passwordAttempt ? message : '');
          track('statement_error', { reason: 'password_required' });
          return;
        }
        track('statement_error', {
          reason:
            caught instanceof PdfTooLargeError
              ? 'too_large'
              : caught instanceof PdfNoTextLayerError
                ? 'no_text_layer'
                : 'unreadable',
        });
        setError(
          caught instanceof PdfTooLargeError || caught instanceof PdfNoTextLayerError
            ? message
            : t('error.generic', { message }),
        );
        setStatus('error');
      }
    },
    [exportLocale, t],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        setError(`${formatBytes(file.size)} > ${formatBytes(MAX_BYTES)}`);
        setStatus('error');
        return;
      }
      setPassword('');
      setDateOrderOverride('auto');
      // Counts and categories only. Never the file name, never its contents.
      track('statement_submitted');
      void run(file);
    },
    [run],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files?.[0];
      if (file) onFiles(event.clipboardData?.files ?? null);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFiles]);

  const download = useCallback(
    async (which: Preset) => {
      if (!result || preparing) return;
      setPreparing(true);
      try {
        const artifact = await buildExport(result, { preset: which, exportLocale, dateFormat, sourceName: fileName });
        // The end of the funnel. Format and row count only — nothing from the statement.
        track('export_download', { preset: which, date_format: dateFormat, export_locale: exportLocale, rows: result.transactions.length });
        const blob =
          artifact.bytes !== undefined
            ? new Blob([artifact.bytes as unknown as BlobPart], { type: artifact.mimeType })
            : new Blob([artifact.text ?? ''], { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = artifact.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus('error');
      } finally {
        setPreparing(false);
      }
    },
    [result, exportLocale, dateFormat, fileName, preparing],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setResult(null);
    setError('');
    setProgress(null);
    setPassword('');
    setPasswordError('');
    pendingFile.current = null;
  }, []);

  if (status === 'ready' && result) {
    return (
      <div className="converter">
        <Preview
          result={result}
          fileName={fileName}
          locale={locale}
          preset={preset}
          exportLocale={exportLocale}
          dateFormat={dateFormat}
          preparing={preparing}
          onPresetChange={(next) => {
            setPreset(next);
            setDateFormat(getExportLocale(exportLocale).dateFormat);
          }}
          onExportLocaleChange={(next) => {
            setExportLocale(next);
            setDateFormat(getExportLocale(next).dateFormat);
          }}
          onDateFormatChange={setDateFormat}
          onDownload={download}
          onReset={reset}
          dateOrderOverride={dateOrderOverride}
          onDateOrderChange={(order) => {
            setDateOrderOverride(order);
            if (pendingFile.current) void run(pendingFile.current, password || undefined, order);
          }}
          onRecheck={(order) => {
            const file = pendingFile.current;
            if (file) void run(file, password || undefined, order);
          }}
        />
      </div>
    );
  }

  return (
    <div className="converter">
      <div className="converter__body">
        {status === 'idle' && (
          <div
            className="dropzone"
            data-dragging={dragging}
            role="button"
            tabIndex={0}
            aria-label={t('dropzone.button')}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFiles(event.dataTransfer?.files ?? null);
            }}
          >
            <p className="dropzone__title">{t('dropzone.title')}</p>
            <p className="muted small" style={{ margin: 0 }}>
              {t('dropzone.hint')}
            </p>
            <button type="button" className="btn btn--primary btn--lg" style={{ marginTop: '0.9rem' }}>
              {t('dropzone.button')}
            </button>
            <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
              {t('dropzone.limits')}
            </p>
            {!compact && (
              <a className="btn--link" href="/scanned/" onClick={(event) => event.stopPropagation()}>
                {t('dropzone.scanned')}
              </a>
            )}
          </div>
        )}

        {status === 'busy' && (
          <div className="stack" style={{ ['--stack-gap' as string]: '0.9rem' }}>
            <div className="converter__status" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span>{progressLabel(progress)}</span>
            </div>
            <div className="progress" aria-hidden="true">
              <div
                className="progress__bar"
                style={{
                  width:
                    progress?.stage === 'extracting' && progress.total
                      ? `${Math.round(((progress.done ?? 0) / progress.total) * 70)}%`
                      : progress?.stage === 'parsing'
                        ? '85%'
                        : progress?.stage === 'done'
                          ? '100%'
                          : '12%',
                }}
              />
            </div>
            <p className="muted small" style={{ margin: 0 }}>
              {t('status.privacyNote')}
            </p>
          </div>
        )}

        {status === 'password' && (
          <form
            className="stack"
            style={{ ['--stack-gap' as string]: '0.9rem' }}
            onSubmit={(event) => {
              event.preventDefault();
              const file = pendingFile.current;
              if (file) void run(file, password);
            }}
          >
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{t('password.title')}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {t('password.hint')}
            </p>
            <div className="field" style={{ maxWidth: '22rem' }}>
              <label htmlFor="pdf-password">{t('password.label')}</label>
              <input
                id="pdf-password"
                className="input"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={passwordError ? 'pdf-password-error' : undefined}
              />
            </div>
            {passwordError && (
              <p className="note note--danger" id="pdf-password-error" role="alert">
                {passwordError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn--primary">
                {t('password.submit')}
              </button>
              <button type="button" className="btn btn--ghost" onClick={reset}>
                {t('password.cancel')}
              </button>
            </div>
          </form>
        )}

        {status === 'error' && (
          <div className="stack" style={{ ['--stack-gap' as string]: '0.9rem' }}>
            <p className="note note--danger" role="alert" style={{ margin: 0 }}>
              {error}
            </p>
            {affiliateUrl && (
              <p className="small muted" style={{ margin: 0 }}>
                {t('error.ocrHint')}{' '}
                <a href={affiliateUrl} rel="sponsored noopener" target="_blank">
                  {t('error.ocrLink')}
                </a>{' '}
                {t('error.ocrOr')} <a href="/scanned/">{t('error.ocrWhy')}</a>.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary" onClick={reset}>
                {t('error.tryAnother')}
              </button>
              <a className="btn btn--ghost" href="/scanned/">
                {t('error.scannedLink')}
              </a>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf,.ofx,.qfx,application/x-ofx"
          onChange={(event) => onFiles(event.target.files)}
        />
      </div>

      <div className="privacy-strip">
        <span>
          <span className="tick" aria-hidden="true">
            ✓
          </span>{' '}
          {t('privacy.neverUploaded')}
        </span>
        <span>
          <span className="tick" aria-hidden="true">
            ✓
          </span>{' '}
          {t('privacy.noSignup')}
        </span>
        <span>
          <span className="tick" aria-hidden="true">
            ✓
          </span>{' '}
          {t('privacy.balanceChecked')}
        </span>
        {localeOptions.length > 1 && status === 'idle' && (
          <span className="privacy-strip__locale">
            <label htmlFor="export-locale-idle">{t('download.locale')}</label>
            <select
              id="export-locale-idle"
              className="select"
              value={exportLocale}
              onChange={(event) => setExportLocale(event.target.value)}
            >
              {localeOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>
    </div>
  );
}
