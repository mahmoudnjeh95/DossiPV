import { PDFDocument } from 'pdf-lib';

export interface AnnexFile {
  buffer: Buffer;
  mimeType: 'pdf' | 'png' | 'jpeg';
}

export async function mergeAnnexes(baseBuffer: Buffer, annexBuffers: AnnexFile[]): Promise<Buffer> {
  const merged = await PDFDocument.load(baseBuffer);

  for (const annex of annexBuffers) {
    try {
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
    } catch {
      // One corrupted/unreadable annex must not abort the whole job — every earlier step
      // (engine, Claude, docx fill, PDF conversion) already succeeded and is more expensive to
      // redo than losing one annex page. Skip and continue.
      continue;
    }
  }

  return Buffer.from(await merged.save());
}
