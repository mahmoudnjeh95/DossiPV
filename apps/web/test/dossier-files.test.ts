import { describe, it, expect } from 'vitest';
import { listJobFiles } from '../lib/dossier-files';

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
