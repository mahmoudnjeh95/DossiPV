/**
 * Generated dossier files for a job. The schema has no file rows for generated output yet
 * (master spec §5 step 8 — dossier.docx, dossier.pdf, annexes.pdf — is deferred by the
 * document-pipeline spec, and the File.storageKey layout is still "decided at implementation
 * time"). This adapter is the single place the results page asks for them, so wiring the real
 * storage later is a change here and nowhere in the page.
 */
export interface DossierFileView {
  kind: 'docx' | 'pdf' | 'annexes';
  label: string;
  href: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the job is the lookup key once storage exists
export function listJobFiles(_job: { id: string; status: string }): DossierFileView[] {
  return [];
}
