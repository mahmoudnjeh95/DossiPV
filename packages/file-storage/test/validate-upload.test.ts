import { describe, it, expect } from 'vitest';
import { validateUploadedFile } from '../src/validate-upload';

const PDF_MAGIC = Buffer.from('%PDF-1.4\n...');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);

describe('validateUploadedFile', () => {
  it('accepts a real PDF (correct magic bytes, correct claimed type, under the size limit)', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', PDF_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'pdf' });
  });

  it('accepts a real PNG', () => {
    const result = validateUploadedFile(PNG_MAGIC, 'image/png', PNG_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'png' });
  });

  it('accepts a real JPEG', () => {
    const result = validateUploadedFile(JPEG_MAGIC, 'image/jpeg', JPEG_MAGIC.length);
    expect(result).toEqual({ valid: true, mimeType: 'jpeg' });
  });

  it('rejects a renamed-extension attack: claimed application/pdf but real bytes are a PNG', () => {
    const result = validateUploadedFile(PNG_MAGIC, 'application/pdf', PNG_MAGIC.length);
    expect(result.valid).toBe(false);
  });

  it('rejects an unsupported claimed MIME type outright', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/zip', PDF_MAGIC.length);
    expect(result.valid).toBe(false);
  });

  it('rejects a file exceeding the 10 MB size limit, regardless of valid magic bytes', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', 10 * 1024 * 1024 + 1);
    expect(result.valid).toBe(false);
  });

  it('accepts a file at exactly the 10 MB boundary', () => {
    const result = validateUploadedFile(PDF_MAGIC, 'application/pdf', 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });
});
