import { PdfNoTextLayerError, PdfPasswordRequiredError } from './types';

/**
 * Translate pdf.js failures into messages a bank-statement user can act on.
 * Password-protected statements are common enough that this is a first-class
 * path, not an error-page afterthought.
 */
export function toFriendlyPdfError(error: unknown): Error {
  const candidate = error as { name?: string; code?: number; message?: string } | null;

  if (candidate?.name === 'PasswordException' || candidate?.code === 1 || candidate?.code === 2) {
    return new PdfPasswordRequiredError(
      candidate?.code === 2 ? 'That password did not open the PDF. Check for typos and try again.' : undefined,
    );
  }

  if (candidate?.name === 'InvalidPDFException') {
    return new Error('That file is not a readable PDF. If it came from your bank, try downloading it again.');
  }

  if (candidate?.name === 'ResponseException' || candidate?.name === 'MissingPDFException') {
    return new Error('The PDF could not be read. Try saving it to your device first, then uploading the saved file.');
  }

  if (error instanceof Error) return error;
  return new Error(String(error));
}

export { PdfNoTextLayerError, PdfPasswordRequiredError };
