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

/**
 * RFC 4180 quoting: only the delimiter, a quote or a line break forces quotes.
 *
 * The comma is deliberately *not* special by itself. A semicolon-delimited file
 * for a German user contains amounts like `405,81`, and quoting those to
 * `"405,81"` is how a numeric column arrives in Excel as text.
 */
export function escapeCsvField(value: string, delimiter: Delimiter): string {
  if (value === '') return '';
  const needsQuotes = value.includes(delimiter) || /["\r\n]/.test(value);
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
