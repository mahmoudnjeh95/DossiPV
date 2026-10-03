/**
 * Generated dossier files for a job, read from DossierJob.docxFileId/pdfFileId/annexesPdfFileId
 * (populated by @dossipv/dossier-worker's processJob once a job succeeds). Returns only the
 * kinds that actually have a saved file yet — a PENDING/RUNNING job, or one that failed before
 * saving any output, correctly yields an empty list rather than a broken link.
 */
export interface DossierFileView {
  kind: 'docx' | 'pdf' | 'annexes';
  label: string;
  href: string;
}

const FILE_KIND_LABELS: Record<DossierFileView['kind'], string> = {
  docx: 'Document Word (.docx)',
  pdf: 'Dossier complet (PDF)',
  annexes: 'Annexes seules (PDF)',
};

export function listJobFiles(
  job: { id: string; docxFileId: string | null; pdfFileId: string | null; annexesPdfFileId: string | null },
  projectId: string,
): DossierFileView[] {
  const entries: { kind: DossierFileView['kind']; fileId: string | null }[] = [
    { kind: 'docx', fileId: job.docxFileId },
    { kind: 'pdf', fileId: job.pdfFileId },
    { kind: 'annexes', fileId: job.annexesPdfFileId },
  ];

  return entries
    .filter((entry) => entry.fileId !== null)
    .map((entry) => ({
      kind: entry.kind,
      label: FILE_KIND_LABELS[entry.kind],
      href: `/projects/${projectId}/jobs/${job.id}/files/${entry.kind}`,
    }));
}
