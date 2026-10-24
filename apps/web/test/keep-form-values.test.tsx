import { describe, it, expect } from 'vitest';
import { restoreFormValues } from '../lib/keep-form-values';
import { documentUploadError, sniffUploadType } from '../lib/upload-check';

describe('restoreFormValues', () => {
  it('puts the submitted values back in text fields, selects and checkboxes', () => {
    document.body.innerHTML = `
      <form>
        <input name="fullName" value="" />
        <select name="clientKind"><option value="residential">R</option><option value="company">C</option></select>
        <textarea name="note"></textarea>
        <input type="checkbox" name="agree" value="1" checked />
        <input type="file" name="doc" />
        <input type="hidden" name="hidden" value="keep" />
      </form>`;
    const form = document.querySelector('form')!;
    const submitted = new FormData();
    submitted.set('fullName', 'Ali Ben Salah');
    submitted.set('clientKind', 'company');
    submitted.set('note', 'ligne 1');
    submitted.set('hidden', 'keep');

    restoreFormValues(form, submitted);

    expect((form.elements.namedItem('fullName') as HTMLInputElement).value).toBe('Ali Ben Salah');
    expect((form.elements.namedItem('clientKind') as HTMLSelectElement).value).toBe('company');
    expect((form.elements.namedItem('note') as HTMLTextAreaElement).value).toBe('ligne 1');
    expect((form.elements.namedItem('agree') as HTMLInputElement).checked).toBe(false);
    expect((form.elements.namedItem('hidden') as HTMLInputElement).value).toBe('keep');
  });
});

describe('upload content check', () => {
  it('recognises PDF, PNG and JPEG by their first bytes', () => {
    expect(sniffUploadType(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffUploadType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    expect(sniffUploadType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffUploadType(Buffer.from('PK\u0003\u0004 docx'))).toBeNull();
  });

  it('tells the installer what to upload when the content is neither a PDF nor an image', () => {
    expect(documentUploadError('Type de fichier non autorisé.', Buffer.from('PK docx'))).toContain('ni un PDF ni une image');
    expect(documentUploadError('Le contenu du fichier ne correspond pas au type déclaré.', Buffer.from('%PDF-1'))).toBe(
      'Le contenu du fichier ne correspond pas au type déclaré.',
    );
  });
});
