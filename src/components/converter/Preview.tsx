import { useMemo, useState } from 'react';
import type { StatementResult } from '../../lib/parse';
import { PRESETS, type Preset } from '../../lib/exporters';
import { DATE_FORMATS, formatDate, type DateFormat } from '../../lib/exporters/dates';

const PREVIEW_LIMIT = 300;

interface Props {
  result: StatementResult;
  fileName: string;
  preset: Preset;
  dateFormat: DateFormat;
  dateOrderOverride: 'auto' | 'MDY' | 'DMY';
  onPresetChange: (preset: Preset) => void;
  onDateFormatChange: (format: DateFormat) => void;
  onDownload: (preset: Preset) => void;
  preparing?: boolean;
  onReset: () => void;
  onDateOrderChange: (order: 'auto' | 'MDY' | 'DMY') => void;
  onRecheck: (order: 'auto' | 'MDY' | 'DMY') => void;
}

function money(value: number | null, showZero = false): string {
  if (value === null) return '';
  if (value === 0 && !showZero) return '';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Preview({
  result,
  fileName,
  preset,
  dateFormat,
  dateOrderOverride,
  onPresetChange,
  onDateFormatChange,
  onDownload,
  preparing = false,
  onReset,
  onDateOrderChange,
  onRecheck,
}: Props) {
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const { reconciliation, quality, transactions } = result;
  const verified = reconciliation.checked >= 3 && reconciliation.passRate >= 0.98;
  const partial = reconciliation.checked >= 1 && !verified;

  const visible = useMemo(
    () => (showFlaggedOnly ? transactions.filter((row) => row.flags.some((flag) => flag !== 'multiline-description')) : transactions),
    [transactions, showFlaggedOnly],
  );
  const shown = visible.slice(0, PREVIEW_LIMIT);

  if (!transactions.length) {
    return (
      <div className="converter__body stack" style={{ ['--stack-gap' as string]: '1rem' }}>
        <p className="note note--warn" role="alert" style={{ margin: 0 }}>
          No transaction rows could be read from this PDF. {quality.reasons[0] ?? 'It may be a scan or an unusually laid-out statement.'}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a className="btn btn--primary" href="/scanned">
            What to do with scanned statements
          </a>
          <button type="button" className="btn btn--ghost" onClick={onReset}>
            Try another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="converter__head">
        {verified ? (
          <span className="badge badge--ok">
            <span className="badge__dot" aria-hidden="true" />
            {reconciliation.matched}/{reconciliation.checked} rows reconcile
          </span>
        ) : partial ? (
          <span className="badge badge--warn">
            <span className="badge__dot" aria-hidden="true" />
            {reconciliation.matched}/{reconciliation.checked} rows reconcile
          </span>
        ) : (
          <span className="badge badge--neutral">
            <span className="badge__dot" aria-hidden="true" />
            No balance column to check against
          </span>
        )}

        <span className="badge badge--neutral">
          {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
        </span>

        <div className="converter__meta">
          <span title={fileName} style={{ maxWidth: '18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </span>
          <span aria-hidden="true">·</span>
          <span>{result.meta.pages} page{result.meta.pages === 1 ? '' : 's'}</span>
          <button type="button" className="btn--link" onClick={onReset}>
            Start over
          </button>
        </div>
      </div>

      <div className="converter__body stack" style={{ ['--stack-gap' as string]: '0.85rem' }}>
        {result.warnings.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {result.warnings.map((warning) => (
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
                <label htmlFor="date-order">Date order</label>
                <select
                  id="date-order"
                  className="select"
                  value={dateOrderOverride}
                  onChange={(event) => onDateOrderChange(event.target.value as 'auto' | 'MDY' | 'DMY')}
                >
                  <option value="auto">Auto (currently {result.dateOrder === 'DMY' ? 'day/month' : 'month/day'})</option>
                  <option value="MDY">Month/day (US)</option>
                  <option value="DMY">Day/month (UK, EU, India)</option>
                </select>
              </div>
              <button type="button" className="btn btn--ghost" onClick={() => onRecheck(dateOrderOverride)}>
                Re-check rows
              </button>
              <p className="field__hint" style={{ margin: 0, maxWidth: '26rem' }}>
                Nothing in this statement proves the order, so a date like <code>03/04/2025</code> is a guess. If the
                dates in the preview look wrong, switch it and re-check.
              </p>
            </div>
          </div>
        )}

        {reconciliation.mismatches.length > 0 && (
          <p className="note note--warn" style={{ margin: 0 }}>
            {reconciliation.mismatches.length} row{reconciliation.mismatches.length === 1 ? '' : 's'} do not add up
            against the statement's running balance. They are highlighted below and flagged in the Notes column, so you
            can check them against the original.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <p className="small muted" style={{ margin: 0 }}>
            Showing {shown.length} of {visible.length} row{visible.length === 1 ? '' : 's'}
            {visible.length > PREVIEW_LIMIT ? ' — the download contains all of them' : ''}
          </p>
          {transactions.some((row) => row.flags.some((flag) => flag !== 'multiline-description')) && (
            <label className="small" style={{ display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="checkbox" checked={showFlaggedOnly} onChange={(event) => setShowFlaggedOnly(event.target.checked)} />
              Only rows needing a check
            </label>
          )}
        </div>

        <div className="table-wrap">
          <table className="data">
            <caption className="visually-hidden">Extracted transactions, preview before download</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col" className="num">
                  Debit
                </th>
                <th scope="col" className="num">
                  Credit
                </th>
                <th scope="col" className="num">
                  Amount
                </th>
                <th scope="col" className="num">
                  Balance
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
                            check
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
          <label htmlFor="preset">Format</label>
          <select
            id="preset"
            className="select"
            value={preset}
            onChange={(event) => onPresetChange(event.target.value as Preset)}
          >
            {Object.values(PRESETS).map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="date-format">Date format</label>
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

        <div className="download-bar__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => onDownload(preset)} disabled={preparing}>
            {preparing ? 'Preparing…' : `Download ${PRESETS[preset].shortLabel}`}
          </button>
          {preset !== 'csv' && (
            <button type="button" className="btn btn--ghost" onClick={() => onDownload('csv')} disabled={preparing}>
              Also CSV
            </button>
          )}
        </div>
      </div>

      <div className="privacy-strip">
        <span>{PRESETS[preset].description}</span>
      </div>
    </>
  );
}
