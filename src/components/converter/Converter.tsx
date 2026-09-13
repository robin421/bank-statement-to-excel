import { useCallback, useEffect, useRef, useState } from 'react';
import { convertFile, type ConvertProgress } from '../../lib/pdf/convertFile';
import { PdfNoTextLayerError, PdfPasswordRequiredError, PdfTooLargeError } from '../../lib/pdf/types';
import { buildExport, PRESETS, type Preset } from '../../lib/exporters';
import { DATE_FORMATS, type DateFormat } from '../../lib/exporters/dates';
import type { StatementResult } from '../../lib/parse';
import Preview from './Preview';

const MAX_BYTES = 60 * 1024 * 1024;

type Status = 'idle' | 'busy' | 'password' | 'ready' | 'error';

interface Props {
  /** Rendered above the dropzone on the homepage only. */
  compact?: boolean;
  affiliateUrl?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressLabel(progress: ConvertProgress | null): string {
  if (!progress) return 'Starting…';
  switch (progress.stage) {
    case 'reading':
      return 'Reading the file…';
    case 'extracting':
      return progress.total
        ? `Reading text from page ${progress.done ?? 0} of ${progress.total}…`
        : 'Reading text…';
    case 'parsing':
      return 'Matching rows and checking the running balance…';
    default:
      return 'Finishing…';
  }
}

export default function Converter({ compact = false, affiliateUrl }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [result, setResult] = useState<StatementResult | null>(null);
  const [fileName, setFileName] = useState<string>('statement.pdf');
  const [error, setError] = useState<string>('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [preset, setPreset] = useState<Preset>('xlsx');
  const [dateFormat, setDateFormat] = useState<DateFormat>('YYYY-MM-DD');
  const [dateOrderOverride, setDateOrderOverride] = useState<'auto' | 'MDY' | 'DMY'>('auto');
  const [preparing, setPreparing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

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
        // Every statement is different, so start from the preset's own default.
        setDateFormat(PRESETS[preset].defaultDateFormat);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught);
        if (caught instanceof PdfPasswordRequiredError) {
          setStatus('password');
          setPasswordError(passwordAttempt ? message : '');
          return;
        }
        setError(
          caught instanceof PdfTooLargeError || caught instanceof PdfNoTextLayerError
            ? message
            : `Could not read this PDF. ${message}`,
        );
        setStatus('error');
      }
    },
    [preset],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (file.size > MAX_BYTES) {
        setError(`That file is ${formatBytes(file.size)}. The in-browser limit is ${formatBytes(MAX_BYTES)} — a bigger statement needs the batch route.`);
        setStatus('error');
        return;
      }
      setPassword('');
      setDateOrderOverride('auto');
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
        const artifact = await buildExport(result, { preset: which, dateFormat, sourceName: fileName });
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
    [result, dateFormat, fileName, preparing],
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
          preset={preset}
          dateFormat={dateFormat}
          onPresetChange={(next) => {
            setPreset(next);
            setDateFormat(PRESETS[next].defaultDateFormat);
          }}
          onDateFormatChange={setDateFormat}
          onDownload={download}
          preparing={preparing}
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
            aria-label="Choose a bank statement PDF"
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
            <p className="dropzone__title">Drop your bank statement here</p>
            <p className="muted small" style={{ margin: 0 }}>
              PDF from online banking, or an OFX / QFX export — click to choose, or paste with <kbd>Ctrl</kbd>/
              <kbd>⌘</kbd>+<kbd>V</kbd>
            </p>
            <button type="button" className="btn btn--primary btn--lg" style={{ marginTop: '0.9rem' }}>
              Choose statement file
            </button>
            <p className="muted small" style={{ margin: '0.35rem 0 0' }}>
              Text-based PDF up to 60 MB / 200 pages, or .ofx / .qfx
            </p>
            {!compact && (
              <a className="btn--link" href="/scanned" onClick={(event) => event.stopPropagation()}>
                Scanned or photographed statement?
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
              This runs on your device. Nothing is uploaded, so a long statement takes as long as your computer needs —
              there is no server queue.
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
            <h2 style={{ fontSize: '1.15rem', margin: 0 }}>This PDF is password protected</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Most banks use your date of birth, account number, or the last four digits of your card. The password is
              used on your device only.
            </p>
            <div className="field" style={{ maxWidth: '22rem' }}>
              <label htmlFor="pdf-password">PDF password</label>
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
                Unlock and convert
              </button>
              <button type="button" className="btn btn--ghost" onClick={reset}>
                Cancel
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
                Scanned statements need OCR.{' '}
                <a href={affiliateUrl} rel="sponsored noopener" target="_blank">
                  Try an OCR service instead
                </a>
                , or read about{' '}
                <a href="/scanned">why a scan cannot be read in the browser</a>.
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary" onClick={reset}>
                Try another file
              </button>
              <a className="btn btn--ghost" href="/scanned">
                Scanned PDFs
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
          Never uploaded — conversion happens in your browser
        </span>
        <span>
          <span className="tick" aria-hidden="true">
            ✓
          </span>{' '}
          No sign-up, no email
        </span>
        <span>
          <span className="tick" aria-hidden="true">
            ✓
          </span>{' '}
          Rows checked against the statement's running balance
        </span>
      </div>
    </div>
  );
}
