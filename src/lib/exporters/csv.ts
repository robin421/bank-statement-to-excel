/**
 * CSV writing with the boring details done properly: RFC 4180 quoting, CRLF
 * line endings (what Excel on Windows expects), optional UTF-8 BOM (so Excel
 * does not mangle non-ASCII merchant names), and a configurable delimiter
 * because European Excel expects semicolons.
 */

export type Delimiter = ',' | ';' | '\t';

export interface CsvOptions {
  delimiter?: Delimiter;
  /** Excel on Windows needs a BOM to read UTF-8 correctly. */
  bom?: boolean;
  /** CRLF is the RFC and what Excel expects; LF is friendlier to git/diff. */
  newline?: '\r\n' | '\n';
}

const NEEDS_QUOTING = /[",\r\n\t]/;

export function escapeCsvField(value: string, delimiter: Delimiter): string {
  if (value === '') return '';
  const needsQuotes = NEEDS_QUOTING.test(value) || value.includes(delimiter);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(rows: string[][], options: CsvOptions = {}): string {
  const delimiter = options.delimiter ?? ',';
  const newline = options.newline ?? '\r\n';
  const body = rows.map((row) => row.map((field) => escapeCsvField(field ?? '', delimiter)).join(delimiter)).join(newline);
  return (options.bom ? '\uFEFF' : '') + body + newline;
}

export function csvToBlob(csv: string, mimeType = 'text/csv;charset=utf-8'): Blob {
  return new Blob([csv], { type: mimeType });
}
