import { describe, it, expect } from 'vitest';
import { attachmentDisposition, dossierDownloadName, listJobFiles } from '../lib/dossier-files';

describe('listJobFiles', () => {
  it('returns all three file views when every output file exists', () => {
    const job = { id: 'job-1', docxFileId: 'file-1', pdfFileId: 'file-2', annexesPdfFileId: 'file-3' };

    const files = listJobFiles(job, 'project-1');

    expect(files).toEqual([
      { kind: 'docx', label: 'Document Word (.docx)', href: '/projects/project-1/jobs/job-1/files/docx' },
      { kind: 'pdf', label: 'Dossier complet (PDF)', href: '/projects/project-1/jobs/job-1/files/pdf' },
      { kind: 'annexes', label: 'Annexes seules (PDF)', href: '/projects/project-1/jobs/job-1/files/annexes' },
    ]);
  });

  it('returns an empty array when no output file exists yet (job still PENDING/RUNNING)', () => {
    const job = { id: 'job-1', docxFileId: null, pdfFileId: null, annexesPdfFileId: null };

    expect(listJobFiles(job, 'project-1')).toEqual([]);
  });

  it('returns only the files that exist when a job partially failed after saving some outputs', () => {
    const job = { id: 'job-1', docxFileId: 'file-1', pdfFileId: null, annexesPdfFileId: null };

    expect(listJobFiles(job, 'project-1')).toEqual([
      { kind: 'docx', label: 'Document Word (.docx)', href: '/projects/project-1/jobs/job-1/files/docx' },
    ]);
  });
});

describe('dossierDownloadName', () => {
  const generatedAt = new Date('2026-10-23T09:30:00Z');

  it("names each file after the client and the generation day", () => {
    expect(dossierDownloadName('pdf', 'Mohamed Ben Ali', generatedAt)).toBe('Dossier technique - Mohamed Ben Ali - 23-10-2026.pdf');
    expect(dossierDownloadName('annexes', 'Mohamed Ben Ali', generatedAt)).toBe('Annexes - Mohamed Ben Ali - 23-10-2026.pdf');
    expect(dossierDownloadName('docx', 'Mohamed Ben Ali', generatedAt)).toBe('Dossier technique - Mohamed Ben Ali - 23-10-2026.docx');
  });

  it('uses the day in Tunis, not in UTC', () => {
    // 23:30 UTC on 23 October is already 00:30 on 24 October in Tunis.
    expect(dossierDownloadName('pdf', 'Sami', new Date('2026-10-23T23:30:00Z'))).toBe('Dossier technique - Sami - 24-10-2026.pdf');
  });

  it('drops characters no file system accepts and keeps accents', () => {
    expect(dossierDownloadName('pdf', '  Hélène / Bén:Ali*  "SARL"  ', generatedAt)).toBe('Dossier technique - Hélène Bén Ali SARL - 23-10-2026.pdf');
  });

  it('falls back to "client" without a usable name', () => {
    expect(dossierDownloadName('pdf', null, generatedAt)).toBe('Dossier technique - client - 23-10-2026.pdf');
    expect(dossierDownloadName('pdf', ' / ', generatedAt)).toBe('Dossier technique - client - 23-10-2026.pdf');
  });
});

describe('attachmentDisposition', () => {
  it('gives an ASCII fallback and the exact UTF-8 name', () => {
    expect(attachmentDisposition("Dossier technique - Hélène L'Ali - 23-10-2026.pdf")).toBe(
      "attachment; filename=\"Dossier technique - Helene L'Ali - 23-10-2026.pdf\"; filename*=UTF-8''Dossier%20technique%20-%20H%C3%A9l%C3%A8ne%20L%27Ali%20-%2023-10-2026.pdf",
    );
  });

  it('replaces non-Latin letters in the ASCII fallback only', () => {
    const header = attachmentDisposition('Annexes - محمد - 23-10-2026.pdf');
    expect(header).toContain('filename="Annexes - ____ - 23-10-2026.pdf"');
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('Annexes - محمد - 23-10-2026.pdf')}`);
  });
});
