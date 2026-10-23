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

const DOWNLOAD_PREFIXES: Record<DossierFileView['kind'], string> = {
  docx: 'Dossier technique',
  pdf: 'Dossier technique',
  annexes: 'Annexes',
};
const DOWNLOAD_EXTENSIONS: Record<DossierFileView['kind'], string> = { docx: 'docx', pdf: 'pdf', annexes: 'pdf' };
// The generation day as the installer lives it, whatever the server's own time zone.
const TUNIS_DAY = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', day: '2-digit', month: '2-digit', year: 'numeric' });
const MAX_CLIENT_NAME_LENGTH = 80;

/**
 * The name a generated file downloads under: `Dossier technique - Mohamed Ben Ali - 23-10-2026.pdf`,
 * with the client's name and the day the job generated it. Characters no file system accepts
 * are dropped from the name; a project without a client name falls back to "client".
 */
export function dossierDownloadName(kind: DossierFileView['kind'], clientFullName: string | null | undefined, generatedAt: Date): string {
  const client =
    (clientFullName ?? '')
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_CLIENT_NAME_LENGTH)
      .trim() || 'client';
  const day = TUNIS_DAY.format(generatedAt).replace(/\//g, '-');
  return `${DOWNLOAD_PREFIXES[kind]} - ${client} - ${day}.${DOWNLOAD_EXTENSIONS[kind]}`;
}

/**
 * `attachment` header for a download name: an ASCII `filename` for old clients (accents
 * stripped, anything else replaced) and the exact UTF-8 name in `filename*` (RFC 6266 / 5987).
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
