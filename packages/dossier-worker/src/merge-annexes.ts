import { PDFDocument } from 'pdf-lib';

export interface AnnexFile {
  buffer: Buffer;
  mimeType: 'pdf' | 'png' | 'jpeg' | 'webp';
  /** How the document is named to the installer when it cannot be read (job warnings). */
  label?: string;
}

export interface MergedDocument {
  pdf: Buffer;
  /** Labels of the annex documents that could not be read and were left out, in order. */
  skipped: string[];
}

/** The annex as a standalone PDF document; throws when it cannot be read or embedded. */
async function loadAnnex(annex: AnnexFile): Promise<PDFDocument> {
  if (annex.mimeType === 'pdf') {
    return PDFDocument.load(annex.buffer);
  }
  if (annex.mimeType === 'webp') {
    // pdf-lib cannot embed WebP; throwing lets the merge skip it like any unreadable annex.
    throw new Error('WebP annexes cannot be embedded in a PDF');
  }
  const doc = await PDFDocument.create();
  // Standalone copy: pdf-lib ignores a pooled Buffer's byteOffset (see embedImageSafely).
  const bytes = Uint8Array.from(annex.buffer);
  const image = annex.mimeType === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return doc;
}

/**
 * The number of pages the annex adds to the dossier, or null when it cannot be read (the merge
 * then leaves it out). Uses the same loader as the merge, so the two always agree.
 */
export async function annexPageCount(annex: AnnexFile): Promise<number | null> {
  try {
    return (await loadAnnex(annex)).getPageCount();
  } catch {
    return null;
  }
}

/**
 * Merges an ordered list of already-rendered PDF fragments (cover, TOC, body, annex divider —
 * each produced by its own renderer) into one document, then appends the annex files in order.
 * One corrupted/unreadable annex is skipped and named in `skipped`, never aborts the whole
 * merge — a fragment itself failing to load IS allowed to throw, since a broken fragment means
 * an earlier pipeline step produced bad output and the job should fail loudly, unlike a bad
 * annex file which is supporting material.
 */
export async function mergeDocumentFragments(fragments: Buffer[], annexFiles: AnnexFile[]): Promise<MergedDocument> {
  const merged = await PDFDocument.create();

  for (const fragment of fragments) {
    const fragmentDoc = await PDFDocument.load(fragment);
    const pages = await merged.copyPages(fragmentDoc, fragmentDoc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const skipped: string[] = [];
  for (const [index, annex] of annexFiles.entries()) {
    try {
      const annexDoc = await loadAnnex(annex);
      const pages = await merged.copyPages(annexDoc, annexDoc.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    } catch {
      // Every earlier step (engine, Claude, docx fill, PDF conversion) already succeeded and is
      // more expensive to redo than losing one annex: skip it, and name it for the job warnings.
      skipped.push(annex.label ?? `Annexe ${index + 1}`);
    }
  }

  return { pdf: Buffer.from(await merged.save()), skipped };
}

export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  return (await mergeDocumentFragments([baseBuffer], annexBuffers)).pdf;
}
