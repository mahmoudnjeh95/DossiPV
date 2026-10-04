import { PDFDocument } from 'pdf-lib';

export interface AnnexFile {
  buffer: Buffer;
  mimeType: 'pdf' | 'png' | 'jpeg';
}

async function appendAnnex(merged: PDFDocument, annex: AnnexFile): Promise<void> {
  if (annex.mimeType === 'pdf') {
    const annexDoc = await PDFDocument.load(annex.buffer);
    const pages = await merged.copyPages(annexDoc, annexDoc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  } else {
    const image = annex.mimeType === 'png' ? await merged.embedPng(annex.buffer) : await merged.embedJpg(annex.buffer);
    const page = merged.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  }
}

/**
 * Merges an ordered list of already-rendered PDF fragments (cover, TOC, body, drawings, map
 * pages — each produced by its own renderer) into one document, then appends the annex files
 * exactly as mergeAnnexes already did. One corrupted/unreadable annex is skipped, never aborts
 * the whole merge (see the try/catch below) — a fragment itself failing to load IS allowed to
 * throw, since a broken fragment (cover/body/drawings/map pages) means an earlier pipeline step
 * produced bad output and the job should fail loudly, unlike a bad annex file which is optional
 * supporting material.
 */
export async function mergeDocumentFragments(fragments: Buffer[], annexFiles: AnnexFile[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const fragment of fragments) {
    const fragmentDoc = await PDFDocument.load(fragment);
    const pages = await merged.copyPages(fragmentDoc, fragmentDoc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  for (const annex of annexFiles) {
    try {
      await appendAnnex(merged, annex);
    } catch {
      // One corrupted/unreadable annex must not abort the whole job — every earlier step
      // (engine, Claude, docx fill, PDF conversion) already succeeded and is more expensive to
      // redo than losing one annex page. Skip and continue.
      continue;
    }
  }

  return Buffer.from(await merged.save());
}

export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  return mergeDocumentFragments([baseBuffer], annexBuffers);
}
